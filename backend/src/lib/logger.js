/**
 * Minimal structured JSON logger.
 * Outputs one JSON object per line for easy parsing by log aggregators.
 * Each entry includes a timestamp and the current environment.
 */

const env = require('../config/env');

/**
 * Serialize a native Error for JSON output (Spec 3.3 / R-15).
 * `message` and `stack` are non-enumerable, so a plain spread silently
 * drops them — log entries would emit `{}` for the error field.
 * @param {*} err
 * @returns {*}
 */
const serializeError = (err) => {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
      code: err.code || err.statusCode,
      ...(err.details ? { details: err.details } : {}),
    };
  }
  return err;
};

/**
 * Serialize Error instances carried in meta under the conventional
 * `error` / `err` keys; every other field passes through unchanged.
 * @param {object} meta
 * @returns {object}
 */
const formatMeta = (meta) => {
  if (!meta || typeof meta !== 'object') return meta;
  const clean = { ...meta };
  if (clean.error) clean.error = serializeError(clean.error);
  if (clean.err) clean.err = serializeError(clean.err);
  return clean;
};

/**
 * Build a structured log payload.
 * @param {string} level
 * @param {string} msg
 * @param {object} meta
 * @returns {string} JSON string
 */
const format = (level, msg, meta) =>
  JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    env: env.nodeEnv,
    msg,
    ...formatMeta(meta),
  });

const logger = {
  /* eslint-disable no-console */
  info: (msg, meta = {}) => console.log(format('info', msg, meta)),
  warn: (msg, meta = {}) => console.warn(format('warn', msg, meta)),
  error: (msg, meta = {}) => console.error(format('error', msg, meta)),
  /* eslint-enable no-console */
};

module.exports = logger;
