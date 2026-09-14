/**
 * Idempotency middleware (Spec 2.1 / R-08).
 *
 * Prevents duplicate financial mutations when clients double-click, retry on
 * flaky networks, or the SPA re-sends a request after a token refresh. A client
 * supplies an `Idempotency-Key` header (1-255 chars, typically a UUID). The
 * first execution's response body is stored in `idempotency_keys` (created by
 * migration 000032); a replayed key returns the stored response with the
 * `Idempotent-Replay: true` header instead of executing the mutation again.
 *
 * Backward compatibility: requests without the header pass straight through,
 * so older SPA builds and third-party callers are unaffected during rollout.
 *
 * Records are scoped to `${userId}:${entityId}` so the same key used by a
 * different user or entity is an independent operation. Persisted responses
 * rely on the 24h TTL index intent from migration 000032 (cleanup job).
 *
 * Failure policy: if the idempotency store lookup fails (DB blip) the request
 * proceeds with a logged warning — availability wins over duplicate risk for a
 * store that is best-effort. Inserts race on the unique(actor_scope, key)
 * constraint and are swallowed as benign.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('../services/supabaseClient');
const AppError = require('../lib/AppError');
const logger = require('../lib/logger');

const IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const MAX_KEY_LENGTH = 255;

const hashRequest = (req) =>
  crypto
    .createHash('sha256')
    .update(req.method + req.originalUrl + JSON.stringify(req.body || {}))
    .digest('hex');

const idempotencyMiddleware = async (req, res, next) => {
  try {
    if (!IDEMPOTENT_METHODS.has(req.method)) return next();

    const key = req.headers['idempotency-key'];
    if (key === undefined || key === null) return next();

    if (typeof key !== 'string' || key.length < 1 || key.length > MAX_KEY_LENGTH) {
      throw new AppError({
        statusCode: 422,
        title: 'Unprocessable Entity',
        detail: `Idempotency-Key must be a string between 1 and ${MAX_KEY_LENGTH} characters.`,
        code: 'ERR_INVALID_IDEMPOTENCY_KEY',
      });
    }

    // The middleware is mounted after auth + entityScope. Requests that reach
    // here without a resolved profile (should not happen on /v1) or without an
    // entity context are passed through unchanged.
    // The middleware runs after entityScope but before the per-router
    // resolveEntity, so the stable entity CODE ('ATA'/'LTA'/'ALL') is used for
    // scoping — entityScope has already validated the caller has access.
    const userId = req.user?.id;
    if (!userId) return next();
    const entityId = req.activeEntity || 'none';

    const actorScope = `${userId}:${entityId}`;
    const requestHash = hashRequest(req);

    const { data: existing, error } = await supabaseAdmin
      .from('idempotency_keys')
      .select('id, request_hash, response_json')
      .eq('actor_scope', actorScope)
      .eq('idempotency_key', key)
      .maybeSingle();

    if (error) {
      logger.warn('idempotency lookup failed; proceeding without replay protection', {
        requestId: req.id,
        error: error.message,
      });
      return next();
    }

    if (existing) {
      if (existing.request_hash && existing.request_hash !== requestHash) {
        throw new AppError({
          statusCode: 422,
          title: 'Unprocessable Entity',
          detail: 'Idempotency key re-used with different request payload.',
          code: 'ERR_IDEMPOTENCY_KEY_REUSED',
        });
      }

      const stored = existing.response_json || {};
      logger.info('idempotent replay', {
        requestId: req.id,
        idempotencyKey: key,
        method: req.method,
        originalUrl: req.originalUrl,
      });
      res.setHeader('Idempotent-Replay', 'true');
      return res.status(stored.status || 200).json(stored.body ?? {});
    }

    // Persist the first successful response for replay. res.json() delegates
    // to res.send() in Express 4, so both entry points are wrapped and the
    // `persisted` flag prevents a double insert.
    let persisted = false;
    const persist = (body) => {
      if (persisted) return;
      if (res.statusCode >= 500) return;
      if (body === undefined || body === null || typeof body === 'function') return;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          return;
        }
      }
      if (typeof body !== 'object') return;
      persisted = true;

      const record = {
        actor_scope: actorScope,
        idempotency_key: key,
        request_hash: requestHash,
        response_json: { status: res.statusCode, body },
      };

      return Promise.resolve(supabaseAdmin.from('idempotency_keys').insert(record))
        .then(({ error: insertError }) => {
          // 23505 = concurrent duplicate insert race — benign, first writer wins.
          if (insertError && insertError.code !== '23505') {
            logger.warn('failed to persist idempotency key', {
              requestId: req.id,
              error: insertError.message,
            });
          }
        })
        .catch((err) => {
          logger.warn('failed to persist idempotency key', {
            requestId: req.id,
            error: err.message,
          });
        });
    };

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      persist(body);
      return originalJson(body);
    };
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      persist(body);
      return originalSend(body);
    };

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { idempotencyMiddleware };
