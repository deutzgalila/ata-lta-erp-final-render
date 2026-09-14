/**
 * Optimistic Concurrency Control helpers (Spec 2.2 / R-10).
 *
 * Mutable records carry an integer `version` column (migration 000031).
 * Clients may declare the version they edited via the `expectedVersion`
 * request-body field or the `If-Match` header; services then append
 * `WHERE version = expectedVersion` to the UPDATE and, when zero rows match,
 * reject with 409 ERR_CONCURRENCY_CONFLICT instead of silently overwriting
 * a concurrent edit ("last write wins"). Both channels are optional so older
 * SPA builds keep working unchanged during rollout.
 */

const AppError = require('./AppError');

const CONCURRENCY_CONFLICT_DETAIL =
  'The record was modified by another user. Please reload the latest version before editing.';

/**
 * The standard 409 conflict thrown when a version-guarded update matches no rows.
 * @returns {AppError}
 */
const concurrencyConflict = () =>
  new AppError({
    statusCode: 409,
    title: 'Conflict',
    detail: CONCURRENCY_CONFLICT_DETAIL,
    code: 'ERR_CONCURRENCY_CONFLICT',
  });

/**
 * Resolve the expected record version for an update request. The request body
 * field takes precedence; the If-Match header is a fallback and tolerates
 * ETag-style values (`W/"3"`, `"3"`, `3`).
 * @param {object} [data] - validated request body
 * @param {object} [headers] - request headers (lowercased, as Express provides)
 * @returns {number|null} positive integer or null when absent/invalid
 */
const resolveExpectedVersion = (data, headers = {}) => {
  const fromBody = data && data.expectedVersion;
  if (fromBody !== undefined && fromBody !== null) {
    const n = Number(fromBody);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  const ifMatch = headers['if-match'];
  if (ifMatch) {
    const m = String(ifMatch).match(/(\d+)/);
    const n = m ? parseInt(m[1], 10) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
};

/**
 * Fill the payload's expectedVersion from the If-Match header when the body
 * did not supply one. Controllers call this on the validated update body right
 * before handing it to the service; services read data.expectedVersion
 * uniformly (mutated in place).
 * @param {object} req - Express request
 * @param {object} payload - validated request body
 * @returns {object} the same payload object
 */
const injectExpectedVersion = (req, payload) => {
  if (!payload || payload.expectedVersion !== undefined) return payload;
  const v = resolveExpectedVersion(null, (req && req.headers) || {});
  if (v !== null) payload.expectedVersion = v;
  return payload;
};

module.exports = {
  concurrencyConflict,
  resolveExpectedVersion,
  injectExpectedVersion,
  CONCURRENCY_CONFLICT_DETAIL,
};
