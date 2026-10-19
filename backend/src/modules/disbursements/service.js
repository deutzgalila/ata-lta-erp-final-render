/**
 * Disbursements service.
 * Business logic for disbursement management with approval workflow.
 *
 * Status flow: Draft → Pending → Approved → Released
 *              (Rejected branches from Pending or Approved)
 *
 * Phase 6 — Agent B
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { generatePdf } = require('../../services/pdfService');
const {
  buildDisbursementDocument,
  DISBURSEMENT_PAGE_CSS,
  DISBURSEMENT_DOCUMENT_CSS,
} = require('./printDocument');
const { supabaseAdmin } = require('../../services/supabaseClient');
const auditService = require('../../services/auditService');
const storageService = require('../../services/storageService');
const AppError = require('../../lib/AppError');
const { concurrencyConflict, resolveExpectedVersion } = require('../../lib/concurrency');
const { buildPermissionSet, hasPermission } = require('../../lib/permissions');
const { resolveEntityCode } = require('../../lib/entityResolver');
const {
  createReservation,
  getReservation,
  completeReservation,
  claimReservationByKey,
  releaseReservationByKey,
  consumeReservationByKey,
  cleanupExpiredReservations,
} = require('./receiptReservationStore');

/** Valid status transitions */
const VALID_TRANSITIONS = {
  submit: { from: ['Draft'], to: 'Submitted' },
  forward_admin: { from: ['Submitted', 'Pending'], to: 'Pending Admin Approval' },
  approve: { from: ['Pending Admin Approval', 'Submitted', 'Pending', 'Draft'], to: 'Released' },
  release: { from: ['Approved', 'Pending Admin Approval'], to: 'Released' },
  fund: { from: ['Released'], to: 'Funded' },
  reject: { from: ['Submitted', 'Pending', 'Pending Admin Approval', 'Draft'], to: 'Rejected' },
};

/**
 * Non-blocking notification dispatch helper (P0-B / Rule R5).
 * Swallows any error to preserve caller operation success.
 */
const safeNotify = async (userIds, type, payload) => {
  try {
    let notifyModule = null;
    try {
      notifyModule = require('../../services/notify');
    } catch (_err) {
      notifyModule = null;
    }

    if (notifyModule && typeof notifyModule.notify === 'function') {
      await notifyModule.notify(userIds, type, payload);
    }
  } catch (err) {
    // Non-blocking: swallow error per Rule R5 / P0-B R3
    // eslint-disable-next-line no-console
    console.warn('[NOTIFY] Failed to dispatch notification:', err?.message || err);
  }
};

/**
 * Generate a disbursement number.
 * Format: DISB-{ENTITY_CODE}-{YYYYMMDD}-{seq}
 *
 * Allocation is delegated to the next_document_sequence() RPC (migration
 * 000047, Spec 2.4 / R-11), whose single-statement upsert takes a row lock on
 * the daily prefix, so concurrent creators can never read the same count and
 * collide. The previous count(*)+1 approach raced under parallel submits.
 *
 * @param {string} _entityId - UUID of the entity (kept for signature stability)
 * @param {string} entityCode - entity code (ATA or LTA)
 * @returns {Promise<string>}
 */
const generateDisbursementNumber = async (_entityId, entityCode) => {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `DISB-${entityCode}-${today}`;

  const { data, error } = await supabaseAdmin.rpc('next_document_sequence', {
    p_prefix: prefix,
  });

  if (error || !data) {
    throw new AppError({
      statusCode: 500,
      title: 'Sequence Error',
      detail: 'Failed to allocate a disbursement number',
    });
  }

  return data;
};

// ============================================================
// Counts for tab badges (no full-table scans)
// ============================================================

/**
 * Count disbursements grouped for module tab badges.
 * @param {object} params
 * @param {string} params.entityId
 * @returns {Promise<{ active: number, archived: number, rejected: number }>}
 */
const VALID_ENTITY_CODES = ['ATA', 'LTA'];

const getDisbursementCounts = async ({ entityId, user }) => {
  const resolve = async (code) => {
    const { data } = await supabaseAdmin
      .from('entities')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    return data?.id;
  };

  const entityIds = [];
  if (entityId === 'ALL') {
    const codes = (user?.entities || []).filter((c) =>
      VALID_ENTITY_CODES.includes(c.toUpperCase())
    );
    const resolved = await Promise.all(codes.map(resolve));
    entityIds.push(...resolved.filter(Boolean));
  } else {
    entityIds.push(entityId);
  }

  if (entityIds.length === 0) {
    return { active: 0, archived: 0, rejected: 0, awaitingRelease: 0 };
  }

  const isAdmin = user?.role === 'Admin';
  const isAccounting =
    (user?.departments || []).includes('Accounting') || user?.role === 'Accounting';

  const runCount = async (query) => {
    const { count, error } = await query;
    if (error) {
      throw new AppError({
        statusCode: 500,
        title: 'Database Error',
        detail: 'Failed to count disbursements',
      });
    }
    return count || 0;
  };

  const baseQuery = () => {
    let q = supabaseAdmin
      .from('disbursements')
      .select('*', { count: 'exact', head: true })
      .in('entity_id', entityIds)
      .is('deleted_at', null);
    if (!isAdmin && !isAccounting) {
      q = q.or(`requested_by.eq.${user.id},created_by.eq.${user.id}`);
    }
    return q;
  };

  const canRelease = (() => {
    if (!user) return false;
    const permissions = buildPermissionSet({
      role: user.role || '',
      departments: user.departments || [],
    });
    return hasPermission(permissions, 'disbursement:mark_released');
  })();

  const activeQuery = baseQuery().neq('archived', true).neq('status', 'Cancelled');

  const [active, archivedCount, cancelledCount, pendingRejected, opsRejected, awaitingRelease] =
    await Promise.all([
      runCount(activeQuery),
      runCount(baseQuery().eq('archived', true)),
      runCount(baseQuery().eq('status', 'Cancelled').eq('archived', false)),
      runCount(
        (() => {
          let q = supabaseAdmin
            .from('pending_changes')
            .select('*', { count: 'exact', head: true })
            .in('entity_id', entityIds)
            .eq('table_name', 'disbursements')
            .eq('status', 'rejected');
          if (!isAdmin && !isAccounting) {
            q = q.eq('submitted_by', user.id);
          }
          return q;
        })()
      ),
      runCount(
        (() => {
          let q = supabaseAdmin
            .from('operations_requests')
            .select('*', { count: 'exact', head: true })
            .in('entity_id', entityIds)
            .eq('type', 'disbursement')
            .eq('status', 'rejected');
          if (!isAdmin && !isAccounting) {
            q = q.eq('requested_by', user.id);
          }
          return q;
        })()
      ),
      canRelease
        ? runCount(baseQuery().eq('status', 'Approved').eq('archived', false))
        : Promise.resolve(0),
    ]);

  const archived = archivedCount + cancelledCount;
  const rejected = pendingRejected + opsRejected;

  return {
    active: Math.max(active, 0),
    archived,
    rejected,
    awaitingRelease,
  };
};

/**
 * Enrich disbursement rows with human-readable names and parent work request info (Task A.4).
 * @param {object[]} rows
 * @returns {Promise<object[]>}
 */
const enrichDisbursementExtras = async (rows = []) => {
  if (!rows || rows.length === 0) return [];

  const wrIds = [
    ...new Set(rows.map((r) => r.linked_work_request_id || r.work_request_id).filter(Boolean)),
  ];
  const userIds = [
    ...new Set(
      rows
        .flatMap((r) => [
          r.employee_id,
          r.requested_by,
          r.created_by,
          r.approved_by,
          r.released_by,
          r.rejected_by,
          r.payment_processed_by,
        ])
        .filter(Boolean)
    ),
  ];

  let wrMap = new Map();
  if (wrIds.length > 0) {
    const { data: wrs } = await supabaseAdmin
      .from('work_requests')
      .select('id, title, work_order_number')
      .in('id', wrIds);
    wrMap = new Map((wrs || []).map((w) => [w.id, w]));
  }

  let userMap = new Map();
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin.from('users').select('id, name').in('id', userIds);
    userMap = new Map((users || []).map((u) => [u.id, u]));
  }

  return rows.map((row) => {
    const wrId = row.linked_work_request_id || row.work_request_id;
    const wr = wrId ? wrMap.get(wrId) : null;
    const editedByAccounting = Boolean(
      row.edited_by_accounting || (row.notes && row.notes.includes('Edited by Accounting'))
    );

    return {
      ...row,
      linked_work_request_name: wr?.title || null,
      linked_work_request_order_number: wr?.work_order_number || null,
      employee_name: userMap.get(row.employee_id)?.name || null,
      requested_by_name: userMap.get(row.requested_by)?.name || null,
      created_by_name: userMap.get(row.created_by)?.name || null,
      approved_by_name: userMap.get(row.approved_by)?.name || null,
      released_by_name: userMap.get(row.released_by)?.name || null,
      rejected_by_name: userMap.get(row.rejected_by)?.name || null,
      edited_by_accounting: editedByAccounting,
    };
  });
};

/**
 * List disbursements for the active entity.
 * @param {object} params
 * @param {string} params.entityId
 * @param {object} [params.filters]
 * @returns {Promise<{ data: object[], count: number }>}
 */
const listDisbursements = async ({ entityId, filters = {}, user }) => {
  const {
    status,
    category,
    fundSource,
    linkedTaskId,
    taskId,
    task_id,
    linkedTransmittalId,
    search,
    archived,
    page = 1,
    limit = 50,
  } = filters;
  const isArchived = archived === true || archived === 'true';

  let query = supabaseAdmin
    .from('disbursements')
    .select('*, clients(name)', { count: 'exact' })
    .is('deleted_at', null);

  if (entityId === 'ALL') {
    const codes = (user?.entities || []).filter((c) =>
      VALID_ENTITY_CODES.includes(c.toUpperCase())
    );
    const resolved = await Promise.all(
      codes.map(async (code) => {
        const { data } = await supabaseAdmin
          .from('entities')
          .select('id')
          .eq('code', code)
          .maybeSingle();
        return data?.id;
      })
    );
    const entityIds = resolved.filter(Boolean);
    if (entityIds.length === 0) {
      return { data: [], count: 0 };
    }
    query = query.in('entity_id', entityIds);
  } else if (entityId) {
    query = query.eq('entity_id', entityId);
  }

  if (isArchived) {
    query = query.eq('archived', true);
  } else if (archived === false || archived === 'false') {
    query = query.eq('archived', false);
  }

  // Role restriction and strict voucher ownership (R2 / D1)
  const isAdmin = user?.role === 'Admin';
  const isAccounting =
    (user?.departments || []).includes('Accounting') || user?.role === 'Accounting';
  if (!isAdmin && !isAccounting) {
    query = query.or(`requested_by.eq.${user.id},created_by.eq.${user.id}`);
  }

  if (status) query = query.eq('status', status);

  if (category) query = query.eq('category', category);
  if (fundSource) query = query.eq('fund_source', fundSource);
  const effectiveFilterTaskId = taskId || task_id || linkedTaskId;
  if (effectiveFilterTaskId) {
    query = query.or(
      `task_id.eq.${effectiveFilterTaskId},linked_task_id.eq.${effectiveFilterTaskId}`
    );
  }
  if (linkedTransmittalId) query = query.eq('linked_transmittal_id', linkedTransmittalId);
  if (search) {
    query = query.or(`description.ilike.%${search}%,disbursement_number.ilike.%${search}%`);
  }

  const offset = (page - 1) * limit;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: 'Failed to fetch disbursements',
    });
  }

  const rows = data || [];
  const { data: entitiesData } = rows.length
    ? await supabaseAdmin.from('entities').select('id, code')
    : { data: [] };
  const entityCodeMap = new Map((entitiesData || []).map((e) => [e.id, e.code]));

  const mapped = rows.map((row) => ({
    ...row,
    entity_code: entityCodeMap.get(row.entity_id) || row.entity_id,
  }));

  const enriched = await enrichDisbursementExtras(mapped);
  return { data: enriched, count: count || 0 };
};

/**
 * Create a new disbursement.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.userId
 * @param {object} params.data
 * @returns {Promise<object>}
 */
const createDisbursement = async ({ entityId, entityCode, userId, data }) => {
  // Reject client-supplied status forgery (AC-1, R1)
  if (data.status !== undefined && data.status !== null) {
    throw new AppError({
      statusCode: 400,
      title: 'Bad Request',
      detail: 'Explicit status cannot be set on creation; status forgery is prohibited',
      code: 'STATUS_FORGERY_PROHIBITED',
    });
  }

  // Determine initial status based on creator's role (AC-1)
  // Staff roles (HR, Operations, Documentation) -> 201 with 'Pending'
  // Management, Accounting, Admin -> 201 with 'Draft' (unchanged behavior)
  let isStaff = false;
  if (userId) {
    const { data: userRecord } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle();

    if (userRecord) {
      const role = userRecord.role;
      if (['Operations', 'Documentation', 'HR'].includes(role)) {
        isStaff = true;
      }
    }
  }

  // Reject foreign employeeId (R2 / AC-4)
  if (data.employeeId && data.employeeId !== userId) {
    throw new AppError({
      statusCode: 403,
      title: 'Forbidden',
      detail: 'Cannot create disbursement voucher for another employee.',
      code: 'DISBURSEMENT_REQUESTER_MISMATCH',
    });
  }

  // Atomically claim receipt reservation if receiptS3Key is supplied (R4 / AC-4)
  let receiptClaim = null;
  if (data.receiptS3Key) {
    const claimResult = claimReservationByKey({
      receiptS3Key: data.receiptS3Key,
      userId,
      entityId,
    });
    if (!claimResult || claimResult.error) {
      const isMismatch = claimResult?.error === 'MISMATCH';
      const isClaimed = claimResult?.error === 'ALREADY_CLAIMED';
      throw new AppError({
        statusCode: isMismatch ? 403 : 400,
        title: isMismatch ? 'Forbidden' : 'Bad Request',
        detail: isMismatch
          ? 'Receipt reservation does not belong to the authenticated user or entity.'
          : isClaimed
            ? 'Receipt reservation is currently being processed by another request.'
            : 'Receipt upload reservation is invalid, unverified, expired, or already consumed.',
        code: isMismatch ? 'RECEIPT_RESERVATION_MISMATCH' : 'INVALID_RECEIPT_RESERVATION',
      });
    }
    receiptClaim = claimResult;
  }

  const initialStatus = isStaff ? 'Pending' : 'Draft';
  const MAX_RETRIES = 5;

  const effectiveTaskId = data.taskId || data.task_id || data.linkedTaskId || null;
  const effectiveWrId =
    data.linkedWorkRequestId || data.workRequestId || data.work_request_id || null;

  // Validation: Task existence & WR association (UAT2-6/12)
  if (effectiveTaskId) {
    const { data: task, error: taskErr } = await supabaseAdmin
      .from('tasks')
      .select('id, work_request_id')
      .eq('id', effectiveTaskId)
      .maybeSingle();

    if (taskErr || !task) {
      if (data.receiptS3Key && receiptClaim) {
        releaseReservationByKey({
          receiptS3Key: data.receiptS3Key,
          userId,
          entityId,
          claimId: receiptClaim.claimId,
        });
      }
      throw new AppError({
        statusCode: 400,
        title: 'Bad Request',
        detail: `Linked task "${effectiveTaskId}" was not found`,
        code: 'TASK_NOT_FOUND',
      });
    }

    if (effectiveWrId && task.work_request_id !== effectiveWrId) {
      if (data.receiptS3Key && receiptClaim) {
        releaseReservationByKey({
          receiptS3Key: data.receiptS3Key,
          userId,
          entityId,
          claimId: receiptClaim.claimId,
        });
      }
      throw new AppError({
        statusCode: 400,
        title: 'Bad Request',
        detail: 'Task does not belong to work request',
        code: 'TASK_WR_MISMATCH',
      });
    }
  }

  let receiptWriteMayHaveCommitted = false;
  try {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const disbursementNumber = await generateDisbursementNumber(
        entityId,
        entityCode || entityId,
        attempt
      );

      const row = {
        disbursement_number: disbursementNumber,
        entity_id: entityId,
        category: data.category,
        description: data.description,
        amount: data.amount,
        fund_source: data.fundSource,
        status: initialStatus,
        client_id: data.clientId || null,
        employee_id: userId,
        linked_invoice_id: data.linkedInvoiceId || null,
        linked_work_request_id: effectiveWrId,
        linked_task_id: effectiveTaskId,
        task_id: effectiveTaskId,
        linked_transmittal_id: data.linkedTransmittalId || null,
        requested_by: userId,
        due_date: data.dueDate || null,
        notes: data.notes || null,
        receipt_s3_key: data.receiptS3Key || null,
        receipt_filename: data.receiptFilename || null,
        created_by: userId,
        updated_by: userId,
      };

      receiptWriteMayHaveCommitted = true;
      const { data: disbursement, error } = await supabaseAdmin
        .from('disbursements')
        .insert(row)
        .select()
        .single();

      if (!error) {
        if (data.receiptS3Key) {
          const consumed = consumeReservationByKey({
            receiptS3Key: data.receiptS3Key,
            userId,
            entityId,
            claimId: receiptClaim?.claimId,
            voucherId: disbursement.id,
          });

          if (!consumed) {
            // The voucher already exists. Keep its claim for reconciliation;
            // deleting it here can race another legitimate voucher update.
            throw new AppError({
              statusCode: 409,
              title: 'Conflict',
              detail:
                'Receipt reservation could not be consumed. It may have already been consumed or claimed by another request.',
              code: 'RECEIPT_RESERVATION_CONSUME_FAILED',
            });
          }
        }

        await auditService.log({
          action: 'disbursement.create',
          table: 'disbursements',
          recordId: disbursement.id,
          entity: entityId,
          userId,
          details: { disbursementNumber, total: data.amount },
        });

        const entityCodeResolved = await resolveEntityCode(disbursement.entity_id);
        return { ...disbursement, entity_code: entityCodeResolved };
      }

      // Only definite statement rejections release the claim. Connection errors
      // and unknown completion outcomes must retain it for reconciliation.
      receiptWriteMayHaveCommitted =
        !/^(?:22[0-9A-Z]{3}|23[0-9A-Z]{3}|42[0-9A-Z]{3}|40001|40P01)$/.test(error.code || '');
      if (error.code !== '23505') {
        throw new AppError({
          statusCode: 500,
          title: 'Database Error',
          detail: 'Failed to create disbursement',
        });
      }
    }

    throw new AppError({
      statusCode: 409,
      title: 'Conflict',
      detail: 'Unable to generate a unique disbursement number. Please retry.',
      code: 'DUPLICATE_DISBURSEMENT_NUMBER',
    });
  } catch (err) {
    if (data.receiptS3Key && receiptClaim && !receiptWriteMayHaveCommitted) {
      releaseReservationByKey({
        receiptS3Key: data.receiptS3Key,
        userId,
        entityId,
        claimId: receiptClaim.claimId,
      });
    }
    throw err;
  }
};

/**
 * Get a single disbursement by ID.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.id
 * @returns {Promise<object>}
 */
const getDisbursementById = async ({ entityId, id, user }) => {
  let query = supabaseAdmin
    .from('disbursements')
    .select('*, clients(name)')
    .eq('id', id)
    .is('deleted_at', null);

  if (entityId && entityId !== 'ALL') {
    query = query.eq('entity_id', entityId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    throw new AppError({
      statusCode: 404,
      title: 'Not Found',
      detail: `Disbursement ${id} not found`,
    });
  }

  // Role restriction & strict ownership enforcement (R2 / D1)
  if (user) {
    const isAdmin = user.role === 'Admin';
    const isAccounting =
      (user.departments || []).includes('Accounting') || user.role === 'Accounting';
    const isOwner = data.requested_by === user.id || data.created_by === user.id;

    if (!isAdmin && !isAccounting) {
      if (!isOwner) {
        throw new AppError({
          statusCode: 403,
          title: 'Forbidden',
          detail: 'You do not have permission to view this disbursement.',
        });
      }
    } else if (user.entities && Array.isArray(user.entities)) {
      const entityCode = await resolveEntityCode(data.entity_id);
      if (entityCode && !user.entities.includes(entityCode)) {
        throw new AppError({
          statusCode: 403,
          title: 'Forbidden',
          detail: 'You do not have permission to view disbursements for this entity.',
        });
      }
    }
  }

  const entityCode = await resolveEntityCode(data.entity_id);
  const enriched = await enrichDisbursementExtras([{ ...data, entity_code: entityCode }]);
  return enriched[0];
};

/**
 * Update a disbursement (only if status is Draft).
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.id
 * @param {string} params.userId
 * @param {object} params.data
 * @returns {Promise<object>}
 */
const updateDisbursement = async ({ entityId, id, userId, data, user }) => {
  const existing = await getDisbursementById({ entityId, id });

  if (data.status === 'Approved' && existing.status === 'Draft') {
    return approveDisbursement({ entityId, id, userId, user });
  }

  let effectiveUser = user;
  if (!effectiveUser && userId) {
    const { data: u } = await supabaseAdmin
      .from('users')
      .select('id, name, role, departments')
      .eq('id', userId)
      .maybeSingle();
    effectiveUser = u;
  }

  const isAccountingUser =
    effectiveUser?.role === 'Accounting' ||
    (effectiveUser?.departments || []).includes('Accounting');
  const isAdminUser = effectiveUser?.role === 'Admin';
  if (data.printDetails !== undefined && !isAdminUser) {
    throw new AppError({
      statusCode: 403,
      title: 'Forbidden',
      detail: 'Only administrators can edit printed voucher details.',
    });
  }

  const financialFields = ['category', 'description', 'amount', 'fundSource'];
  const isEditingFinancial = financialFields.some((f) => data[f] !== undefined);

  const contentFields = [
    'category',
    'description',
    'amount',
    'fundSource',
    'clientId',
    'employeeId',
    'linkedInvoiceId',
    'linkedWorkRequestId',
    'workRequestId',
    'work_request_id',
    'linkedTaskId',
    'taskId',
    'task_id',
    'linkedTransmittalId',
    'dueDate',
    'notes',
  ];
  const isUpdatingContent = contentFields.some((field) => data[field] !== undefined);

  const isReviewStatus = ['Draft', 'Submitted', 'Pending', 'Pending Admin Approval'].includes(
    existing.status
  );

  if (isUpdatingContent && existing.status !== 'Draft') {
    if (isAdminUser || (isAccountingUser && isReviewStatus)) {
      // Administrators can correct released vouchers; Accounting retains review-stage edits.
    } else {
      throw new AppError({
        statusCode: 409,
        title: 'Conflict',
        detail: `Cannot edit disbursement in "${existing.status}" status. Only Draft disbursements can be edited.`,
      });
    }
  }

  if (
    (data.printDetails !== undefined || (isAdminUser && isUpdatingContent && !isReviewStatus)) &&
    resolveExpectedVersion(data) === null
  ) {
    throw new AppError({
      statusCode: 400,
      title: 'Validation Error',
      detail: 'expectedVersion is required for administrator voucher corrections.',
    });
  }

  const effectiveTaskId =
    data.taskId !== undefined
      ? data.taskId
      : data.task_id !== undefined
        ? data.task_id
        : data.linkedTaskId !== undefined
          ? data.linkedTaskId
          : undefined;

  const effectiveWrId =
    data.linkedWorkRequestId !== undefined
      ? data.linkedWorkRequestId
      : data.workRequestId !== undefined
        ? data.workRequestId
        : data.work_request_id !== undefined
          ? data.work_request_id
          : existing.linked_work_request_id;

  // Validation: Task existence & WR association (UAT2-6/12)
  if (effectiveTaskId) {
    const { data: task, error: taskErr } = await supabaseAdmin
      .from('tasks')
      .select('id, work_request_id')
      .eq('id', effectiveTaskId)
      .maybeSingle();

    if (taskErr || !task) {
      throw new AppError({
        statusCode: 400,
        title: 'Bad Request',
        detail: `Linked task "${effectiveTaskId}" was not found`,
        code: 'TASK_NOT_FOUND',
      });
    }

    if (effectiveWrId && task.work_request_id !== effectiveWrId) {
      throw new AppError({
        statusCode: 400,
        title: 'Bad Request',
        detail: 'Task does not belong to work request',
        code: 'TASK_WR_MISMATCH',
      });
    }
  } else if (
    effectiveTaskId === undefined &&
    (data.linkedWorkRequestId !== undefined ||
      data.workRequestId !== undefined ||
      data.work_request_id !== undefined)
  ) {
    // If only WR is updated, check existing linked task against new WR
    const existingTaskId = existing.task_id || existing.linked_task_id;
    if (existingTaskId && effectiveWrId) {
      const { data: task } = await supabaseAdmin
        .from('tasks')
        .select('id, work_request_id')
        .eq('id', existingTaskId)
        .maybeSingle();
      if (task && task.work_request_id !== effectiveWrId) {
        throw new AppError({
          statusCode: 400,
          title: 'Bad Request',
          detail: 'Task does not belong to work request',
          code: 'TASK_WR_MISMATCH',
        });
      }
    }
  }

  // Prohibit reassigning requester, creator, or employee identity (R2 / AC-4)
  if (data.employeeId !== undefined && data.employeeId !== existing.employee_id) {
    throw new AppError({
      statusCode: 403,
      title: 'Forbidden',
      detail: 'Cannot reassign disbursement requester or employee identity.',
      code: 'DISBURSEMENT_REQUESTER_MISMATCH',
    });
  }

  const updates = {
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  if (data.printDetails !== undefined) updates.print_details = data.printDetails;
  if (data.category !== undefined) updates.category = data.category;
  if (data.description !== undefined) updates.description = data.description;
  if (data.amount !== undefined) updates.amount = data.amount;
  if (data.fundSource !== undefined) updates.fund_source = data.fundSource;
  if (data.clientId !== undefined) updates.client_id = data.clientId;
  if (data.linkedInvoiceId !== undefined) updates.linked_invoice_id = data.linkedInvoiceId;
  if (
    data.linkedWorkRequestId !== undefined ||
    data.workRequestId !== undefined ||
    data.work_request_id !== undefined
  ) {
    updates.linked_work_request_id = effectiveWrId;
  }
  if (effectiveTaskId !== undefined) {
    updates.linked_task_id = effectiveTaskId;
    updates.task_id = effectiveTaskId;
  }
  if (data.linkedTransmittalId !== undefined)
    updates.linked_transmittal_id = data.linkedTransmittalId;
  if (data.dueDate !== undefined) updates.due_date = data.dueDate;
  if (data.status !== undefined) updates.status = data.status;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.archived !== undefined) updates.archived = data.archived;
  // Enforce attachment provenance and paired metadata (R5 / F8)
  let receiptReservationClaim = null;
  const isReceiptKeyProvided = data.receiptS3Key !== undefined;
  const isReceiptFilenameProvided = data.receiptFilename !== undefined;

  if (isReceiptKeyProvided || isReceiptFilenameProvided) {
    const newKey = data.receiptS3Key;
    const newFilename = data.receiptFilename;

    if (newKey === null) {
      // Explicitly clearing attachment
      if (newFilename) {
        throw new AppError({
          statusCode: 400,
          title: 'Bad Request',
          detail: 'Cannot set receiptFilename when receiptS3Key is null.',
          code: 'INVALID_RECEIPT_ATTACHMENT',
        });
      }
      updates.receipt_s3_key = null;
      updates.receipt_filename = null;
    } else if (!isReceiptKeyProvided && isReceiptFilenameProvided) {
      // Filename provided without S3 key
      if (!existing.receipt_s3_key) {
        // Existing voucher has no S3 key: reject filename-only update
        throw new AppError({
          statusCode: 400,
          title: 'Bad Request',
          detail: 'Cannot set receiptFilename without a valid receiptS3Key.',
          code: 'INVALID_RECEIPT_ATTACHMENT',
        });
      }
      if (newFilename === null) {
        throw new AppError({
          statusCode: 400,
          title: 'Bad Request',
          detail: 'Cannot clear receiptFilename while retaining receiptS3Key.',
          code: 'INVALID_RECEIPT_ATTACHMENT',
        });
      }
      updates.receipt_filename = newFilename;
    } else if (newKey === existing.receipt_s3_key) {
      // Retaining existing persisted key (already verified and consumed)
      updates.receipt_s3_key = newKey;
      if (isReceiptFilenameProvided) {
        if (newFilename === null) {
          throw new AppError({
            statusCode: 400,
            title: 'Bad Request',
            detail: 'Cannot clear receiptFilename while retaining receiptS3Key.',
            code: 'INVALID_RECEIPT_ATTACHMENT',
          });
        }
        updates.receipt_filename = newFilename;
      }
    } else {
      // New or replacement key: enforce verified reservation provenance
      const claimResult = claimReservationByKey({
        receiptS3Key: newKey,
        userId,
        entityId,
      });

      if (!claimResult || claimResult.error) {
        const isMismatch = claimResult?.error === 'MISMATCH';
        throw new AppError({
          statusCode: isMismatch ? 403 : 400,
          title: isMismatch ? 'Forbidden' : 'Bad Request',
          detail: isMismatch
            ? 'Receipt reservation does not belong to the authenticated user or entity.'
            : 'Receipt upload reservation is invalid, unverified, expired, or already consumed.',
          code: isMismatch ? 'RECEIPT_RESERVATION_MISMATCH' : 'INVALID_RECEIPT_RESERVATION',
        });
      }

      const resolvedFilename = newFilename || claimResult.data.filename;
      if (!resolvedFilename) {
        releaseReservationByKey({
          receiptS3Key: newKey,
          userId,
          entityId,
          claimId: claimResult.claimId,
        });
        throw new AppError({
          statusCode: 400,
          title: 'Bad Request',
          detail: 'receiptFilename is required when receiptS3Key is provided.',
          code: 'INVALID_RECEIPT_ATTACHMENT',
        });
      }

      updates.receipt_s3_key = newKey;
      updates.receipt_filename = resolvedFilename;
      receiptReservationClaim = { key: newKey, claimId: claimResult.claimId };
    }
  }

  // Prepend Accounting edit notes and set edited_by_accounting: true (Task A.5)
  if (isAccountingUser && isEditingFinancial) {
    const editPrefix = `[Edited by Accounting on ${new Date().toLocaleDateString('en-PH')} by ${effectiveUser?.name || 'Accounting Staff'}] `;
    const currentNotes = data.notes !== undefined ? data.notes : existing.notes || '';
    updates.notes = currentNotes ? `${editPrefix}${currentNotes}` : editPrefix.trim();
    updates.edited_by_accounting = true;
  }

  // OCC (Spec 2.2 / R-10): version-guard the update when the client declares
  // the version it read; zero matching rows become a 409 conflict.
  const expectedVersion = resolveExpectedVersion(data);
  if (expectedVersion !== null) {
    updates.version = (existing.version || 1) + 1;
  }

  let query = supabaseAdmin
    .from('disbursements')
    .update(updates)
    .eq('id', id)
    .eq('entity_id', entityId);
  if (expectedVersion !== null) {
    query = query.eq('version', expectedVersion);
  }

  let receiptWriteMayHaveCommitted = true;
  try {
    const { data: updated, error } = await query.select().maybeSingle();
    if (
      (!error && !updated) ||
      (error &&
        /^(?:22[0-9A-Z]{3}|23[0-9A-Z]{3}|42[0-9A-Z]{3}|40001|40P01)$/.test(error.code || ''))
    ) {
      receiptWriteMayHaveCommitted = false;
    }

    if (error) {
      throw new AppError({
        statusCode: 500,
        title: 'Database Error',
        detail: 'Failed to update disbursement',
      });
    }

    if (!updated) {
      if (expectedVersion !== null) {
        throw concurrencyConflict();
      }
      throw new AppError({
        statusCode: 404,
        title: 'Not Found',
        detail: `Disbursement ${id} not found`,
      });
    }

    if (receiptReservationClaim) {
      const consumed = consumeReservationByKey({
        receiptS3Key: receiptReservationClaim.key,
        userId,
        entityId,
        claimId: receiptReservationClaim.claimId,
        voucherId: updated.id,
      });

      if (!consumed) {
        // The update committed. Do not restore a stale pre-update snapshot.
        throw new AppError({
          statusCode: 409,
          title: 'Conflict',
          detail:
            'Receipt reservation could not be consumed. It may have already been consumed or claimed by another request.',
          code: 'RECEIPT_RESERVATION_CONSUME_FAILED',
        });
      }
    }

    const enriched = await enrichDisbursementExtras([updated]);
    return enriched[0];
  } catch (err) {
    if (receiptReservationClaim && !receiptWriteMayHaveCommitted) {
      releaseReservationByKey({
        receiptS3Key: receiptReservationClaim.key,
        userId,
        entityId,
        claimId: receiptReservationClaim.claimId,
      });
    }
    throw err;
  }
};

/**
 * Archive a disbursement.
 */
const archiveDisbursement = async ({ entityId, id, userId }) => {
  const existing = await getDisbursementById({ entityId, id });
  const { data: updated, error } = await supabaseAdmin
    .from('disbursements')
    .update({ archived: true, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('entity_id', entityId)
    .select()
    .single();

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: 'Failed to archive disbursement',
    });
  }

  await auditService.log({
    action: 'disbursement.archive',
    table: 'disbursements',
    recordId: id,
    entity: entityId,
    userId,
    details: { disbursementNumber: existing.disbursement_number },
  });

  const entityCode = await resolveEntityCode(updated.entity_id);
  return { ...updated, entity_code: entityCode };
};

/**
 * Unarchive a disbursement.
 */
const unarchiveDisbursement = async ({ entityId, id, userId }) => {
  const existing = await getDisbursementById({ entityId, id });
  const { data: updated, error } = await supabaseAdmin
    .from('disbursements')
    .update({ archived: false, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('entity_id', entityId)
    .select()
    .single();

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: 'Failed to unarchive disbursement',
    });
  }

  await auditService.log({
    action: 'disbursement.unarchive',
    table: 'disbursements',
    recordId: id,
    entity: entityId,
    userId,
    details: { disbursementNumber: existing.disbursement_number },
  });

  const entityCode = await resolveEntityCode(updated.entity_id);
  return { ...updated, entity_code: entityCode };
};

/**
 * Helper to perform a status transition.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.id
 * @param {string} params.userId
 * @param {string} params.action - Transition action name
 * @param {object} [params.extraUpdates] - Additional fields to set
 * @returns {Promise<object>}
 */
const performTransition = async ({ entityId, id, userId, action, extraUpdates = {}, user }) => {
  const transition = VALID_TRANSITIONS[action];
  const validFrom = Array.isArray(transition.from) ? [...transition.from] : [transition.from];

  if (action === 'approve') {
    let effectiveUser = user;
    if (!effectiveUser && userId) {
      const { data: u } = await supabaseAdmin
        .from('users')
        .select('id, name, role, departments')
        .eq('id', userId)
        .maybeSingle();
      effectiveUser = u;
    }
    const permissions = effectiveUser
      ? effectiveUser.permissions instanceof Set
        ? effectiveUser.permissions
        : buildPermissionSet({
            role: effectiveUser.role || '',
            departments: effectiveUser.departments || [],
          })
      : new Set();
    const canDirectApprove =
      effectiveUser?.role === 'Admin' ||
      hasPermission(permissions, 'disbursement:approve') ||
      hasPermission(permissions, 'disbursement:*');

    if (canDirectApprove && !validFrom.includes('Draft')) {
      validFrom.push('Draft');
    }
  }

  const paymentDetails =
    action === 'release' || action === 'approve'
      ? {
          method: extraUpdates.payment_method,
          reference: extraUpdates.payment_reference,
          bank: extraUpdates.payment_bank,
          date: extraUpdates.payment_date,
        }
      : undefined;

  const reason = action === 'reject' ? extraUpdates.rejection_reason : undefined;

  const { data: rows, error: rpcError } = await supabaseAdmin.rpc('disbursement_transition', {
    p_id: id,
    p_from_statuses: validFrom,
    p_to_status: transition.to,
    p_user_id: userId,
    p_entity_id: entityId,
    p_reason: reason,
    p_payment_details: paymentDetails,
    p_expected_version: extraUpdates.expectedVersion || null,
  });

  if (rpcError) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: `Failed to ${action} disbursement`,
    });
  }

  if (!rows || rows.length === 0) {
    const current = await getDisbursementById({ entityId, id });
    if (!current) {
      throw new AppError({
        statusCode: 404,
        title: 'Not Found',
        detail: `Disbursement ${id} not found`,
      });
    }
    if (
      extraUpdates.expectedVersion !== undefined &&
      extraUpdates.expectedVersion !== null &&
      current.version !== Number(extraUpdates.expectedVersion)
    ) {
      throw new AppError({
        statusCode: 409,
        title: 'Conflict',
        detail:
          'The record was modified by another user. Please reload the latest version before editing.',
        code: 'ERR_CONCURRENCY_CONFLICT',
      });
    }
    throw new AppError({
      statusCode: 409,
      title: 'Invalid Transition',
      detail: `Cannot ${action} a disbursement in "${current?.status || 'unknown'}" status. Expected: ${validFrom.join(' or ')}.`,
      code: 'CONFLICT_CURRENT_STATUS',
    });
  }

  const updated = rows[0];

  await auditService.log({
    action: `disbursement.${action}`,
    table: 'disbursements',
    recordId: id,
    entity: entityId,
    userId,
    details: { from: validFrom, to: transition.to },
  });

  if (action === 'approve' && !updated.approved_by) {
    await supabaseAdmin
      .from('disbursements')
      .update({ approved_by: userId, approved_at: new Date().toISOString() })
      .eq('id', id);
    updated.approved_by = userId;
    updated.approved_at = new Date().toISOString();
  }

  const entityCode = await resolveEntityCode(updated.entity_id);
  const enriched = await enrichDisbursementExtras([{ ...updated, entity_code: entityCode }]);
  return enriched[0];
};

/**
 * Submit a disbursement for approval. Draft → Submitted.
 */
const submitDisbursement = async ({ entityId, id, userId }) => {
  return performTransition({
    entityId,
    id,
    userId,
    action: 'submit',
    extraUpdates: {},
  });
};

/**
 * Forward a disbursement to Admin approval. [Submitted, Pending] → Pending Admin Approval.
 */
const forwardDisbursement = async ({ entityId, id, userId }) => {
  return performTransition({
    entityId,
    id,
    userId,
    action: 'forward_admin',
    extraUpdates: {},
  });
};

/**
 * Approve a disbursement directly to Released (R3 / D2).
 * Pending Admin Approval | Submitted | Pending | Draft → Released.
 */
const approveDisbursement = async ({
  entityId,
  id,
  userId,
  user,
  paymentDetails = {},
  expectedVersion = null,
}) => {
  const result = await performTransition({
    entityId,
    id,
    userId,
    user,
    action: 'approve',
    extraUpdates: {
      approved_by: userId,
      approved_at: new Date().toISOString(),
      released_by: userId,
      released_at: new Date().toISOString(),
      payment_method: paymentDetails?.method || null,
      payment_reference: paymentDetails?.reference || null,
      payment_bank: paymentDetails?.bank || null,
      payment_date: paymentDetails?.date || new Date().toISOString().slice(0, 10),
      payment_processed_by: userId,
      expectedVersion,
    },
  });

  const creatorId = result.requested_by || result.created_by;
  if (creatorId) {
    await safeNotify([creatorId], 'pending_request.resolved', {
      request_id: result.id,
      table_name: 'disbursements',
      outcome: 'approved',
      title: result.disbursement_number || result.description,
    });
  }

  return result;
};

/**
 * Release a disbursement. Approved | Pending Admin Approval → Released.
 */
const releaseDisbursement = async ({
  entityId,
  id,
  userId,
  paymentDetails = {},
  expectedVersion = null,
}) => {
  return performTransition({
    entityId,
    id,
    userId,
    action: 'release',
    extraUpdates: {
      released_by: userId,
      released_at: new Date().toISOString(),
      payment_method: paymentDetails.method || null,
      payment_reference: paymentDetails.reference || null,
      payment_bank: paymentDetails.bank || null,
      payment_date: paymentDetails.date || new Date().toISOString().slice(0, 10),
      payment_processed_by: userId,
      expectedVersion,
    },
  });
};

/**
 * Fund a disbursement. Released → Funded.
 */
const fundDisbursement = async ({ entityId, id, userId }) => {
  return performTransition({
    entityId,
    id,
    userId,
    action: 'fund',
    extraUpdates: {
      funded_by: userId,
      funded_at: new Date().toISOString(),
    },
  });
};

/**
 * Reject a disbursement. Pending → Rejected.
 */
const rejectDisbursement = async ({ entityId, id, userId, reason }) => {
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    throw new AppError({
      statusCode: 400,
      title: 'Bad Request',
      detail: 'Rejection reason is required',
      code: 'REJECTION_REASON_REQUIRED',
    });
  }

  const trimmedReason = reason.trim();
  const result = await performTransition({
    entityId,
    id,
    userId,
    action: 'reject',
    extraUpdates: {
      rejected_by: userId,
      rejected_at: new Date().toISOString(),
      rejection_reason: trimmedReason,
    },
  });

  const creatorId = result.requested_by || result.created_by;
  if (creatorId) {
    await safeNotify([creatorId], 'pending_request.resolved', {
      request_id: result.id,
      table_name: 'disbursements',
      outcome: 'rejected',
      reason: trimmedReason,
      title: result.disbursement_number || result.description,
    });
  }

  return result;
};

/**
 * Update disbursement status directly.
 * Allows transition from 'Draft' directly to 'Approved' if user.role === 'Admin' or user has disbursement:approve.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.id
 * @param {string} params.userId
 * @param {string} params.status
 * @param {object} [params.user]
 * @param {string} [params.rejectionReason]
 * @param {object} [params.paymentDetails]
 * @returns {Promise<object>}
 */
const updateDisbursementStatus = async ({
  entityId,
  id,
  userId,
  status,
  user,
  rejectionReason,
  paymentDetails,
}) => {
  if (status === 'Approved') {
    return approveDisbursement({ entityId, id, userId, user });
  }
  if (status === 'Pending') {
    return submitDisbursement({ entityId, id, userId });
  }
  if (status === 'Released') {
    return releaseDisbursement({ entityId, id, userId, paymentDetails });
  }
  if (status === 'Rejected') {
    return rejectDisbursement({ entityId, id, userId, reason: rejectionReason });
  }
  throw new AppError({
    statusCode: 400,
    title: 'Bad Request',
    detail: `Unknown status transition target: "${status}"`,
  });
};

// ============================================================
// Disbursement Templates
// ============================================================

/**
 * List disbursement templates for the entity.
 * @param {object} params
 * @param {string} params.entityId
 * @returns {Promise<object[]>}
 */
const listDisbursementTemplates = async ({ entityId }) => {
  let query = supabaseAdmin
    .from('disbursement_templates')
    .select('*, entities(code)')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (entityId && entityId !== 'ALL') {
    query = query.eq('entity_id', entityId);
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: 'Failed to fetch disbursement templates',
    });
  }

  return data || [];
};

/**
 * Create a disbursement template.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.userId
 * @param {object} params.data
 * @returns {Promise<object>}
 */
const createDisbursementTemplate = async ({ entityId, userId, data }) => {
  const row = {
    entity_id: entityId,
    name: data.name,
    category: data.category,
    amount: data.amount,
    fund_source: data.fundSource || null,
    schedule: data.schedule || null,
    description: data.description || null,
    linked_work_request_id: data.linkedWorkRequestId || null,
    linked_invoice_id: data.linkedInvoiceId || null,
    linked_transmittal_id: data.linkedTransmittalId || null,
    created_by: userId,
  };

  const { data: template, error } = await supabaseAdmin
    .from('disbursement_templates')
    .insert(row)
    .select('*, entities(code)')
    .single();

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: 'Failed to create disbursement template',
    });
  }

  return template;
};

/**
 * Update a disbursement template.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.id
 * @param {object} params.data
 * @returns {Promise<object>}
 */
const updateDisbursementTemplate = async ({ entityId, id, data }) => {
  const updates = { updated_at: new Date().toISOString() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.category !== undefined) updates.category = data.category;
  if (data.amount !== undefined) updates.amount = data.amount;
  if (data.fundSource !== undefined) updates.fund_source = data.fundSource;
  if (data.schedule !== undefined) updates.schedule = data.schedule;
  if (data.description !== undefined) updates.description = data.description;
  if (data.linkedWorkRequestId !== undefined)
    updates.linked_work_request_id = data.linkedWorkRequestId;
  if (data.linkedInvoiceId !== undefined) updates.linked_invoice_id = data.linkedInvoiceId;
  if (data.linkedTransmittalId !== undefined)
    updates.linked_transmittal_id = data.linkedTransmittalId;

  const { data: updated, error } = await supabaseAdmin
    .from('disbursement_templates')
    .update(updates)
    .eq('id', id)
    .eq('entity_id', entityId)
    .is('deleted_at', null)
    .select('*, entities(code)')
    .single();

  if (error || !updated) {
    throw new AppError({
      statusCode: 404,
      title: 'Not Found',
      detail: `Disbursement template ${id} not found`,
    });
  }

  return updated;
};

/**
 * Soft-delete a disbursement template.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.id
 * @returns {Promise<void>}
 */
const deleteDisbursementTemplate = async ({ entityId, id }) => {
  const { error } = await supabaseAdmin
    .from('disbursement_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('entity_id', entityId);

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: 'Failed to delete disbursement template',
    });
  }
};

/**
 * Update payment details on Released or Funded vouchers (R3 / D2).
 * Strictly preserves status, approved_by, approved_at, released_by, released_at, and fund history.
 */
const updatePaymentDetails = async ({
  entityId,
  id,
  userId,
  user,
  method,
  reference,
  bank,
  date,
  expectedVersion,
}) => {
  const existing = await getDisbursementById({ entityId, id, user });
  if (!['Released', 'Funded'].includes(existing.status)) {
    throw new AppError({
      statusCode: 409,
      title: 'Conflict',
      detail: `Payment details can only be updated for Released or Funded disbursements. Current status: ${existing.status}`,
      code: 'CONFLICT_CURRENT_STATUS',
    });
  }

  if (
    expectedVersion !== undefined &&
    expectedVersion !== null &&
    existing.version !== Number(expectedVersion)
  ) {
    throw new AppError({
      statusCode: 409,
      title: 'Conflict',
      detail:
        'The record was modified by another user. Please reload the latest version before editing.',
      code: 'ERR_CONCURRENCY_CONFLICT',
    });
  }

  const paymentUpdates = {
    payment_method: method.trim(),
    payment_reference: reference ? reference.trim() : null,
    payment_bank: bank ? bank.trim() : null,
    payment_date: date,
    updated_by: userId,
    updated_at: new Date().toISOString(),
    version: existing.version + 1,
  };

  const { data: updated, error } = await supabaseAdmin
    .from('disbursements')
    .update(paymentUpdates)
    .eq('id', id)
    .eq('entity_id', existing.entity_id || entityId)
    .eq('version', existing.version)
    .select()
    .single();

  if (error || !updated) {
    throw new AppError({
      statusCode: 409,
      title: 'Conflict',
      detail:
        'The record was modified by another user. Please reload the latest version before editing.',
      code: 'ERR_CONCURRENCY_CONFLICT',
    });
  }

  await auditService.log({
    action: 'disbursement.payment_details_update',
    table: 'disbursements',
    recordId: id,
    entity: existing.entity_id || entityId,
    userId,
    details: {
      before: {
        payment_method: existing.payment_method,
        payment_reference: existing.payment_reference,
        payment_bank: existing.payment_bank,
        payment_date: existing.payment_date,
      },
      after: {
        payment_method: updated.payment_method,
        payment_reference: updated.payment_reference,
        payment_bank: updated.payment_bank,
        payment_date: updated.payment_date,
      },
    },
  });

  const entityCode = await resolveEntityCode(updated.entity_id);
  const enriched = await enrichDisbursementExtras([{ ...updated, entity_code: entityCode }]);
  return enriched[0];
};

/**
 * Create a receipt upload reservation and issue a pre-signed upload URL (R5 / D4).
 */
const createReceiptUpload = async ({
  entityId,
  entityCode,
  userId,
  user: _user,
  filename,
  contentType,
  size,
}) => {
  let resolvedCode = entityCode;
  if (!resolvedCode || resolvedCode === entityId) {
    resolvedCode = (await resolveEntityCode(entityId)) || 'ATA';
  }
  const cryptoUUID = crypto.randomUUID();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectKey = `entities/${resolvedCode}/disbursements/receipts/${cryptoUUID}-${sanitizedFilename}`;

  const uploadUrl = await storageService.getSignedUploadUrl({
    path: objectKey,
    contentType,
    expiresInSeconds: 900,
  });

  const reservation = createReservation({
    uploadId: cryptoUUID,
    userId,
    entityId,
    entityCode,
    objectKey,
    filename,
    contentType,
    size,
    expiresInSeconds: 900,
  });

  return {
    uploadId: reservation.uploadId,
    uploadUrl,
    objectKey: reservation.objectKey,
    expiresAt: reservation.expiresAt,
  };
};

/**
 * Verify receipt upload completion in storage and mark reservation completed (R5 / D4).
 */
const completeReceiptUpload = async ({ entityId, uploadId, userId, user: _user }) => {
  const reservation = getReservation(uploadId);
  if (!reservation) {
    throw new AppError({
      statusCode: 404,
      title: 'Not Found',
      detail: 'Receipt upload reservation not found or expired.',
      code: 'UPLOAD_RESERVATION_NOT_FOUND',
    });
  }

  if (
    reservation.userId !== userId ||
    (reservation.entityId && reservation.entityId !== entityId)
  ) {
    throw new AppError({
      statusCode: 403,
      title: 'Forbidden',
      detail: 'Cannot complete receipt upload reservation belonging to another user or entity.',
      code: 'UPLOAD_RESERVATION_MISMATCH',
    });
  }

  if (reservation.status === 'consumed') {
    throw new AppError({
      statusCode: 409,
      title: 'Conflict',
      detail: 'Receipt upload reservation has already been consumed and cannot be re-completed.',
      code: 'RECEIPT_RESERVATION_ALREADY_CONSUMED',
    });
  }

  if (reservation.status === 'claimed') {
    throw new AppError({
      statusCode: 409,
      title: 'Conflict',
      detail: 'Receipt upload reservation is currently being claimed by an active voucher request.',
      code: 'RECEIPT_RESERVATION_ALREADY_CLAIMED',
    });
  }

  const verification = await storageService.verifyReceiptObject({
    path: reservation.objectKey,
    expectedSize: reservation.size,
    expectedContentType: reservation.contentType,
  });

  if (!verification.valid) {
    throw new AppError({
      statusCode: 422,
      title: 'Unprocessable Entity',
      detail: verification.error || 'Receipt upload verification failed.',
      code: verification.code || 'RECEIPT_UPLOAD_VERIFICATION_FAILED',
    });
  }

  const completeResult = completeReservation(uploadId, { userId, entityId });
  if (completeResult && completeResult.error === 'ALREADY_CONSUMED') {
    throw new AppError({
      statusCode: 409,
      title: 'Conflict',
      detail: 'Receipt upload reservation has already been consumed.',
      code: 'RECEIPT_RESERVATION_ALREADY_CONSUMED',
    });
  }
  if (completeResult && completeResult.error === 'ALREADY_CLAIMED') {
    throw new AppError({
      statusCode: 409,
      title: 'Conflict',
      detail: 'Receipt upload reservation is currently being claimed by an active voucher request.',
      code: 'RECEIPT_RESERVATION_ALREADY_CLAIMED',
    });
  }

  if (!completeResult || completeResult.error) {
    throw new AppError({
      statusCode: 409,
      title: 'Receipt upload unavailable',
      detail: 'Upload expired or cleanup started during verification. Create a new upload.',
      code: 'RECEIPT_RESERVATION_UNAVAILABLE',
    });
  }

  return {
    receiptS3Key: reservation.objectKey,
    receiptFilename: reservation.filename,
  };
};

/**
 * Retrieve an authorized pre-signed download URL or explicit unavailable state for legacy vouchers (R5 / D4).
 */
const getReceiptUrl = async ({ entityId, id, userId: _userId, user }) => {
  const voucher = await getDisbursementById({ entityId, id, user });

  // Case 1: No supporting document attached
  if (!voucher.receipt_s3_key && !voucher.receipt_filename) {
    throw new AppError({
      statusCode: 404,
      title: 'Not Found',
      detail: 'Disbursement has no supporting document attached.',
      code: 'RECEIPT_NOT_FOUND',
    });
  }

  // Case 2: Legacy record with receipt_filename present but receipt_s3_key is null
  if (!voucher.receipt_s3_key && voucher.receipt_filename) {
    return {
      status: 'unavailable',
      filename: voucher.receipt_filename,
      reason: 'legacy_attachment_missing',
    };
  }

  // Case 3: Valid receipt_s3_key
  const url = await storageService.getSignedDownloadUrl({
    path: voucher.receipt_s3_key,
    expiresInSeconds: 300,
  });

  const ext = (voucher.receipt_filename || voucher.receipt_s3_key).split('.').pop()?.toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === 'pdf') contentType = 'application/pdf';
  else if (ext === 'png') contentType = 'image/png';
  else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';

  return {
    url,
    filename: voucher.receipt_filename || voucher.receipt_s3_key.split('/').pop(),
    contentType,
    expiresAt: new Date(Date.now() + 300 * 1000).toISOString(),
  };
};

/**
 * Soft-delete a disbursement.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.id
 * @param {string} params.userId
 * @returns {Promise<void>}
 */
const deleteDisbursement = async ({ entityId, id, userId }) => {
  const existing = await getDisbursementById({ entityId, id });
  const { error } = await supabaseAdmin
    .from('disbursements')
    .update({ deleted_at: new Date().toISOString(), updated_by: userId })
    .eq('id', id)
    .eq('entity_id', entityId);

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: 'Failed to delete disbursement',
    });
  }

  await auditService.log({
    action: 'disbursement.delete',
    table: 'disbursements',
    recordId: id,
    entity: entityId,
    userId,
    details: { disbursementNumber: existing.disbursement_number },
  });
};

module.exports = {
  listDisbursements,
  createDisbursement,
  getDisbursementById,
  updateDisbursement,
  deleteDisbursement,
  archiveDisbursement,
  unarchiveDisbursement,
  submitDisbursement,
  approveDisbursement,
  releaseDisbursement,
  fundDisbursement,
  rejectDisbursement,
  forwardDisbursement,
  enrichDisbursementExtras,
  getDisbursementCounts,
  listDisbursementTemplates,
  createDisbursementTemplate,
  updateDisbursementTemplate,
  deleteDisbursementTemplate,
  updateDisbursementStatus,
  updatePaymentDetails,
  createReceiptUpload,
  completeReceiptUpload,
  getReceiptUrl,
  cleanupExpiredReservations,
};

/** Generate the canonical voucher; scope/ownership checks match the detail endpoint. */
const generateDisbursementPdf = async ({
  entityId,
  id,
  user,
  noLogo = false,
  includeCompanyDetails = true,
}) => {
  const voucher = await getDisbursementById({ entityId, id, user });
  const code = voucher.entity_code;
  let body = buildDisbursementDocument(voucher, { noLogo, includeCompanyDetails });
  if (includeCompanyDetails && !noLogo) {
    const logo = code === 'LTA' ? 'LTA-LOGO.jpg' : 'ATA-LOGO.jpg';
    const data = fs
      .readFileSync(path.join(__dirname, '../billing/assets', logo))
      .toString('base64');
    body = body.replace(`/ERP_Assets/${logo}`, `data:image/jpeg;base64,${data}`);
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${DISBURSEMENT_PAGE_CSS}${DISBURSEMENT_DOCUMENT_CSS}body { margin:0; }</style></head><body><main class="disbursement-document">${body}</main></body></html>`;
  const buffer = await generatePdf({ html, options: { format: 'A4', preferCSSPageSize: true } });
  const suffix = !includeCompanyDetails ? '-no-company-details' : noLogo ? '-no-logo' : '';
  const url = await storageService.uploadBuffer({
    path: `entities/${code}/disbursements/${id}/pdf/${voucher.disbursement_number || id}${suffix}.pdf`,
    buffer,
    contentType: 'application/pdf',
  });
  return { url };
};
module.exports.generateDisbursementPdf = generateDisbursementPdf;
