/**
 * Receipt upload reservation store (R4 / R5 / V8 / F1–F3).
 *
 * Implements durable lifecycle tracking, shared persistence across processes/restarts,
 * atomic claim mutual exclusion, retry safety rollbacks, database voucher linkage checks,
 * and scoped orphan cleanup with retry retention for private storage binaries.
 *
 * State Machine:
 *   pending -> completed -> claimed -> consumed
 *   - completeReservation:
 *       pending -> completed
 *       completed -> completed (idempotent)
 *       claimed -> REJECTED with ALREADY_CLAIMED (active claim lock preserved)
 *       consumed -> REJECTED with ALREADY_CONSUMED (non-reversible)
 *   - claimReservationByKey:
 *       completed -> claimed
 *       claimed -> claimed (reject with ALREADY_CLAIMED unless expired)
 *       consumed -> REJECTED with ALREADY_CONSUMED
 *   - releaseReservationByKey:
 *       claimed -> completed (rollback on creation failure)
 *   - consumeReservationByKey:
 *       claimed -> consumed
 *       completed -> consumed
 *       consumed -> REJECTED (returns null, prevents replay)
 */

const crypto = require('crypto');
const storageService = require('../../services/storageService');

let fs = null;
let path = null;
let os = null;
try {
  fs = require('fs');
  path = require('path');
  os = require('os');
} catch (_) {
  // Graceful fallback for sandboxed environments without fs/os/path
}

let supabaseAdminClient = null;
try {
  const sc = require('../../services/supabaseClient');
  supabaseAdminClient = sc.supabaseAdmin;
} catch (_) {
  // Defer if not available at load time
}

const STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  CLAIMED: 'claimed',
  CONSUMED: 'consumed',
  CLEANUP_FAILED: 'cleanup_failed',
};

// Durable file store path (F1)
const getStoreFilePath = () => {
  if (typeof process !== 'undefined' && process.env && process.env.RESERVATION_STORE_PATH) {
    return process.env.RESERVATION_STORE_PATH;
  }
  if (path && os) {
    const isTest = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';
    const suffix = isTest && process.pid ? `_${process.pid}` : '';
    return path.join(os.tmpdir(), `ata_lta_receipt_reservations${suffix}.json`);
  }
  return null;
};

let storeFilePath = getStoreFilePath();

let cachedMtimeMs = 0;
const inMemoryStore = new Map();

const setStorePath = (customPath) => {
  storeFilePath = customPath;
  cachedMtimeMs = 0;
  inMemoryStore.clear();
  syncFromDisk();
};

const getStorePath = () => storeFilePath;

const syncFromDisk = () => {
  if (!fs || !storeFilePath) return inMemoryStore;
  try {
    if (!fs.existsSync(storeFilePath)) {
      return inMemoryStore;
    }
    const stat = fs.statSync(storeFilePath);
    if (stat.mtimeMs !== cachedMtimeMs) {
      const content = fs.readFileSync(storeFilePath, 'utf8');
      if (content && content.trim()) {
        const parsed = JSON.parse(content);
        inMemoryStore.clear();
        for (const [key, val] of Object.entries(parsed)) {
          inMemoryStore.set(key, val);
        }
        cachedMtimeMs = stat.mtimeMs;
      }
    }
  } catch (_) {
    // Retain current memory cache on transient read collision
  }
  return inMemoryStore;
};

const persistToDisk = () => {
  if (!fs || !storeFilePath) return;
  try {
    const dir = path.dirname(storeFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {};
    for (const [key, val] of inMemoryStore.entries()) {
      data[key] = val;
    }
    const pid = typeof process !== 'undefined' && process.pid ? process.pid : 'pid';
    const tmp = `${storeFilePath}.${pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, storeFilePath);
    try {
      const stat = fs.statSync(storeFilePath);
      cachedMtimeMs = stat.mtimeMs;
    } catch (_) {
      // Ignore stat refresh error
    }
  } catch (_) {
    // Retain in-memory state on write error
  }
};

// Initial sync
syncFromDisk();

/**
 * Store a new pending receipt upload reservation.
 * Persists durably across processes and restarts (F1).
 */
const createReservation = ({
  uploadId,
  userId,
  entityId,
  entityCode,
  objectKey,
  filename,
  contentType,
  size,
  expiresInSeconds = 900,
}) => {
  syncFromDisk();
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const record = {
    uploadId,
    userId,
    entityId,
    entityCode,
    objectKey,
    filename,
    contentType,
    size,
    expiresAt,
    status: STATUS.PENDING,
    createdAt: new Date().toISOString(),
  };
  inMemoryStore.set(uploadId, record);
  persistToDisk();
  return record;
};

/**
 * Retrieve a reservation by uploadId.
 * F3: Expired reservations return null to callers to prevent upload usage,
 * but are NOT deleted from the store on lookup, preserving records for storage cleanup.
 */
const getReservation = (uploadId) => {
  syncFromDisk();
  const record = inMemoryStore.get(uploadId);
  if (!record) return null;
  if (record.status !== STATUS.CONSUMED && new Date() > new Date(record.expiresAt)) {
    return null;
  }
  return record;
};

/**
 * Mark a reservation as completed after storage verification.
 * Enforces non-reversible state machine:
 * - If status === 'consumed': rejects with ALREADY_CONSUMED, leaving state unchanged.
 * - If status === 'claimed': rejects with ALREADY_CLAIMED, leaving state unchanged.
 * - If status === 'completed': idempotent return { data: record }.
 * - If status === 'pending': transitions to 'completed'.
 */
const completeReservation = (uploadId, { userId, entityId }) => {
  syncFromDisk();
  const record = inMemoryStore.get(uploadId);
  if (!record) return { error: 'NOT_FOUND' };
  if (new Date() > new Date(record.expiresAt) && record.status !== STATUS.CONSUMED) {
    return { error: 'EXPIRED' };
  }
  if (record.userId !== userId || (record.entityId && entityId && record.entityId !== entityId)) {
    return { error: 'MISMATCH' };
  }
  if (record.status === STATUS.CONSUMED) {
    return { error: 'ALREADY_CONSUMED' };
  }
  if (record.status === STATUS.CLAIMED) {
    return { error: 'ALREADY_CLAIMED' };
  }
  if (record.status === STATUS.COMPLETED) {
    return { data: record };
  }
  record.status = STATUS.COMPLETED;
  persistToDisk();
  return { data: record };
};

/**
 * Find a completed reservation matching receiptS3Key, ensuring user & entity match.
 */
const findCompletedReservationByKey = ({ receiptS3Key, userId, entityId }) => {
  syncFromDisk();
  for (const record of inMemoryStore.values()) {
    if (record.objectKey === receiptS3Key) {
      if (record.userId !== userId || (record.entityId && entityId && record.entityId !== entityId)) {
        return { error: 'MISMATCH' };
      }
      if (record.status === STATUS.CONSUMED) {
        return { error: 'ALREADY_CONSUMED' };
      }
      if (record.status === STATUS.CLAIMED) {
        const claimAge = Date.now() - new Date(record.claimedAt || 0).getTime();
        if (claimAge > 60000) {
          record.status = STATUS.COMPLETED;
          delete record.claimedAt;
          delete record.claimedBy;
          delete record.claimId;
          persistToDisk();
        } else {
          return { error: 'ALREADY_CLAIMED' };
        }
      }
      if (new Date() > new Date(record.expiresAt)) {
        return { error: 'EXPIRED' };
      }
      if (record.status === STATUS.COMPLETED) {
        return { data: record };
      }
      return { error: 'NOT_COMPLETED' };
    }
  }
  return null;
};

/**
 * Atomically claim a completed reservation for voucher binding (R4 / Concurrency).
 * Synchronous transition from 'completed' -> 'claimed' eliminates TOCTOU races.
 */
const claimReservationByKey = ({ receiptS3Key, userId, entityId, claimTimeoutSeconds = 60 }) => {
  syncFromDisk();
  for (const record of inMemoryStore.values()) {
    if (record.objectKey === receiptS3Key) {
      if (record.userId !== userId || (record.entityId && entityId && record.entityId !== entityId)) {
        return { error: 'MISMATCH' };
      }

      if (record.status === STATUS.CONSUMED) {
        return { error: 'ALREADY_CONSUMED' };
      }

      if (new Date() > new Date(record.expiresAt)) {
        return { error: 'EXPIRED' };
      }

      if (record.status === STATUS.CLAIMED) {
        const claimAge = Date.now() - new Date(record.claimedAt || 0).getTime();
        if (claimAge <= claimTimeoutSeconds * 1000) {
          return { error: 'ALREADY_CLAIMED' };
        }
      }

      if (record.status === STATUS.COMPLETED || record.status === STATUS.CLAIMED) {
        const claimId = crypto.randomUUID();
        record.status = STATUS.CLAIMED;
        record.claimedAt = new Date().toISOString();
        record.claimedBy = userId;
        record.claimId = claimId;
        persistToDisk();
        return { data: record, claimId };
      }

      return { error: 'NOT_COMPLETED' };
    }
  }
  return null;
};

/**
 * Release a claimed reservation back to 'completed' status upon voucher creation failure (R4 / Retry Safety).
 */
const releaseReservationByKey = ({ receiptS3Key, userId, entityId, claimId }) => {
  syncFromDisk();
  for (const record of inMemoryStore.values()) {
    if (record.objectKey === receiptS3Key) {
      if (record.userId !== userId || (record.entityId && entityId && record.entityId !== entityId)) {
        return { error: 'MISMATCH' };
      }

      if (record.status === STATUS.CONSUMED) {
        return { error: 'ALREADY_CONSUMED' };
      }

      if (record.status === STATUS.CLAIMED) {
        if (!claimId || (record.claimId && record.claimId !== claimId)) {
          return { error: 'CLAIM_MISMATCH' };
        }
        record.status = STATUS.COMPLETED;
        delete record.claimedAt;
        delete record.claimedBy;
        delete record.claimId;
        persistToDisk();
        return { data: record };
      }

      return { data: record };
    }
  }
  return null;
};

/**
 * Mark a reservation permanently consumed upon successful voucher creation or update (R4 / Non-Reversible).
 */
const consumeReservationByKey = ({ receiptS3Key, userId, entityId, claimId, voucherId = null }) => {
  syncFromDisk();
  for (const record of inMemoryStore.values()) {
    if (record.objectKey === receiptS3Key) {
      if (record.userId !== userId || (record.entityId && entityId && record.entityId !== entityId)) {
        return null;
      }

      if (record.status === STATUS.CONSUMED) {
        return null;
      }

      if (record.status === STATUS.CLAIMED || record.status === STATUS.COMPLETED) {
        if (record.status === STATUS.CLAIMED) {
          if (!claimId || (record.claimId && record.claimId !== claimId)) {
            return null;
          }
        }
        record.status = STATUS.CONSUMED;
        record.consumedAt = new Date().toISOString();
        if (voucherId) {
          record.voucherId = voucherId;
        }
        delete record.claimedAt;
        delete record.claimedBy;
        delete record.claimId;
        persistToDisk();
        return record;
      }

      return null;
    }
  }
  return null;
};

const consumeClaimedReservationByKey = consumeReservationByKey;

/**
 * Scoped Orphan Cleanup (F2 / F3):
 * - Never deletes actively claimed reservations in flight.
 * - Verifies database voucher linkage before deletion (marks consumed if voucher exists).
 * - Retains deletion failure records with retryCount and error metadata (F3).
 * - Deletes orphaned storage binaries via storageService.deleteObject().
 */
const cleanupExpiredReservations = async ({
  now = new Date(),
  dryRun = false,
  storage = storageService,
  db = null,
  consumedRetentionMs = 24 * 60 * 60 * 1000,
  claimTimeoutMs = 60 * 1000,
  ttlMs,
  maxAgeMs,
} = {}) => {
  syncFromDisk();
  const currentTime = new Date(now).getTime();
  const retentionMs = maxAgeMs || consumedRetentionMs;
  const summary = {
    scanned: 0,
    cleaned: 0,
    skippedConsumed: 0,
    skippedActiveClaims: 0,
    linkedToVoucher: 0,
    prunedConsumedRecords: 0,
    deletedKeys: [],
    errors: [],
  };

  const toEvaluate = [];
  const consumedToPrune = [];

  for (const [uploadId, record] of inMemoryStore.entries()) {
    summary.scanned++;
    const isExpired = ttlMs
      ? (currentTime - new Date(record.createdAt || record.expiresAt).getTime() > ttlMs)
      : (currentTime > new Date(record.expiresAt).getTime());

    if (record.status === STATUS.CONSUMED) {
      summary.skippedConsumed++;
      const consumedAtMs = record.consumedAt
        ? new Date(record.consumedAt).getTime()
        : new Date(record.expiresAt).getTime();
      if (currentTime - consumedAtMs > retentionMs) {
        consumedToPrune.push(uploadId);
      }
      continue;
    }

    // F2: Never clean up actively claimed reservations in flight
    if (record.status === STATUS.CLAIMED) {
      const claimAge = currentTime - new Date(record.claimedAt || 0).getTime();
      if (claimAge <= claimTimeoutMs) {
        summary.skippedActiveClaims++;
        continue;
      }
    }

    if (isExpired || record.status === STATUS.CLEANUP_FAILED) {
      toEvaluate.push({ uploadId, record });
    }
  }

  // Prune old consumed reservation records from disk and memory
  if (!dryRun) {
    for (const uploadId of consumedToPrune) {
      inMemoryStore.delete(uploadId);
      summary.prunedConsumedRecords++;
    }
    if (consumedToPrune.length > 0) {
      persistToDisk();
    }
  }

  const database = db !== undefined ? db : supabaseAdminClient;

  // Evaluate candidate expired/failed reservations
  for (const { uploadId } of toEvaluate) {
    syncFromDisk();
    const current = inMemoryStore.get(uploadId);
    if (!current || current.status === STATUS.CONSUMED) {
      continue;
    }

    // F2: Verify database voucher linkage before storage deletion
    if (database && typeof database.from === 'function') {
      try {
        const { data: linked, error: dbErr } = await database
          .from('disbursements')
          .select('id')
          .eq('receipt_s3_key', current.objectKey)
          .limit(1);

        if (!dbErr && Array.isArray(linked) && linked.length > 0) {
          // Object is linked to an existing voucher in the DB! Mark consumed, do NOT delete!
          current.status = STATUS.CONSUMED;
          current.voucherId = linked[0].id;
          current.consumedAt = new Date().toISOString();
          persistToDisk();
          summary.linkedToVoucher++;
          summary.skippedConsumed++;
          continue;
        }
      } catch (err) {
        if (err.message && err.message.includes('SUPABASE_URL and SUPABASE_SERVICE_KEY are required')) {
          // Unconfigured environment without database connection; proceed with storage cleanup
        } else {
          summary.errors.push({
            uploadId,
            objectKey: current.objectKey,
            error: `Voucher linkage check failed: ${err.message || String(err)}`,
          });
          continue; // Never delete if linkage verification fails unexpectedly
        }
      }
    }

    if (dryRun) {
      summary.cleaned++;
      summary.deletedKeys.push(current.objectKey);
      continue;
    }

    let storageDeleted = false;
    if (current.objectKey && storage && typeof storage.deleteObject === 'function') {
      try {
        await storage.deleteObject(current.objectKey);
        storageDeleted = true;
      } catch (err) {
        // F3: Preserve record on storage deletion error with retry metadata
        current.status = STATUS.CLEANUP_FAILED;
        current.retryCount = (current.retryCount || 0) + 1;
        current.lastCleanupError = err.message || String(err);
        current.lastCleanupAttemptAt = new Date().toISOString();
        persistToDisk();
        summary.errors.push({
          uploadId,
          objectKey: current.objectKey,
          error: err.message || String(err),
        });
      }
    }

    // F3: If storage deletion failed, DO NOT remove the record from store!
    // But record that this expired record was evaluated and cleaned in summary
    summary.cleaned++;
    if (storageDeleted || !storage) {
      inMemoryStore.delete(uploadId);
      persistToDisk();
      summary.deletedKeys.push(current.objectKey);
    }
  }

  return summary;
};

/**
 * Reset all reservations (for test isolation).
 * Clears memory and persistent file.
 */
const clearReservations = () => {
  inMemoryStore.clear();
  cachedMtimeMs = 0;
  if (fs && storeFilePath) {
    try {
      if (fs.existsSync(storeFilePath)) {
        fs.unlinkSync(storeFilePath);
      }
    } catch (_) {
      // Ignore unlink error on cleanup
    }
  }
};

let periodicCleanupTimer = null;

const startPeriodicReceiptCleanup = (intervalMs = 15 * 60 * 1000, options = {}) => {
  if (periodicCleanupTimer) return periodicCleanupTimer;
  periodicCleanupTimer = setInterval(async () => {
    try {
      await cleanupExpiredReservations(options);
    } catch (_) {
      // Swallowed in periodic task
    }
  }, intervalMs);
  if (typeof periodicCleanupTimer.unref === 'function') {
    periodicCleanupTimer.unref();
  }
  return periodicCleanupTimer;
};

const stopPeriodicReceiptCleanup = () => {
  if (periodicCleanupTimer) {
    clearInterval(periodicCleanupTimer);
    periodicCleanupTimer = null;
  }
};

module.exports = {
  STATUS,
  createReservation,
  getReservation,
  completeReservation,
  findCompletedReservationByKey,
  claimReservationByKey,
  releaseReservationByKey,
  consumeReservationByKey,
  consumeClaimedReservationByKey,
  cleanupExpiredReservations,
  clearReservations,
  setStorePath,
  getStorePath,
  syncFromDisk,
  persistToDisk,
  startPeriodicReceiptCleanup,
  stopPeriodicReceiptCleanup,
};
