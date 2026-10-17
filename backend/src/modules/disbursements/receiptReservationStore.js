/**
 * Receipt upload reservation store (R5 / D4).
 *
 * Implements ephemeral reservation tracking for pre-signed private storage uploads.
 * Reservations expire after 15 minutes (900 seconds) and are strictly bound to
 * the authenticated user (userId) and entity (entityId).
 */

const reservations = new Map();

/**
 * Store a new pending receipt upload reservation.
 * @param {Object} param0
 * @param {string} param0.uploadId - UUID of the reservation
 * @param {string} param0.userId - User who initiated the upload
 * @param {string} param0.entityId - Entity UUID
 * @param {string} param0.entityCode - Entity Code (e.g. ATA, LTA)
 * @param {string} param0.objectKey - Opaque storage object key
 * @param {string} param0.filename - Original sanitized filename
 * @param {string} param0.contentType - MIME type (application/pdf, image/png, image/jpeg)
 * @param {number} param0.size - File size in bytes (<= 10 MiB)
 * @param {number} [param0.expiresInSeconds=900]
 * @returns {Object} reservation
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
    status: 'pending', // 'pending' | 'completed' | 'consumed'
    createdAt: new Date().toISOString(),
  };
  reservations.set(uploadId, record);
  return record;
};

/**
 * Retrieve a reservation by uploadId.
 * Cleans up expired reservations automatically.
 * @param {string} uploadId
 * @returns {Object|null}
 */
const getReservation = (uploadId) => {
  const record = reservations.get(uploadId);
  if (!record) return null;
  if (new Date() > new Date(record.expiresAt)) {
    reservations.delete(uploadId);
    return null;
  }
  return record;
};

/**
 * Mark a reservation as completed after storage verification.
 * @param {string} uploadId
 * @param {Object} param1
 * @param {string} param1.userId
 * @param {string} param1.entityId
 * @returns {{ data?: Object, error?: string }}
 */
const completeReservation = (uploadId, { userId, entityId }) => {
  const record = getReservation(uploadId);
  if (!record) return { error: 'NOT_FOUND' };
  if (record.userId !== userId || (record.entityId && entityId && record.entityId !== entityId)) {
    return { error: 'MISMATCH' };
  }
  record.status = 'completed';
  return { data: record };
};

/**
 * Find a completed reservation matching receiptS3Key, ensuring user & entity match.
 * @param {Object} param0
 * @param {string} param0.receiptS3Key
 * @param {string} param0.userId
 * @param {string} param0.entityId
 * @returns {{ data?: Object, error?: string } | null}
 */
const findCompletedReservationByKey = ({ receiptS3Key, userId, entityId }) => {
  for (const record of reservations.values()) {
    if (
      record.objectKey === receiptS3Key &&
      record.status === 'completed' &&
      new Date() <= new Date(record.expiresAt)
    ) {
      if (record.userId !== userId || (record.entityId && entityId && record.entityId !== entityId)) {
        return { error: 'MISMATCH' };
      }
      return { data: record };
    }
  }
  return null;
};

/**
 * Mark a reservation as consumed upon successful voucher creation.
 * @param {Object} param0
 * @param {string} param0.receiptS3Key
 * @param {string} param0.userId
 * @param {string} param0.entityId
 * @returns {Object|null}
 */
const consumeReservationByKey = ({ receiptS3Key, userId, entityId }) => {
  const found = findCompletedReservationByKey({ receiptS3Key, userId, entityId });
  if (found?.data) {
    found.data.status = 'consumed';
    return found.data;
  }
  return null;
};

/**
 * Reset all reservations (for test isolation).
 */
const clearReservations = () => {
  reservations.clear();
};

module.exports = {
  createReservation,
  getReservation,
  completeReservation,
  findCompletedReservationByKey,
  consumeReservationByKey,
  clearReservations,
};
