/**
 * Logger Error-serialization unit tests (Spec 3.3 / R-15).
 *
 * JSON.stringify silently drops an Error's non-enumerable message/stack.
 * The logger must serialize Errors passed under meta.error / meta.err so
 * failure investigations actually contain the failure.
 */

const logger = require('../../../src/lib/logger');

describe('logger Error serialization', () => {
  const captured = [];
  const original = { log: console.log, warn: console.warn, error: console.error };

  beforeEach(() => {
    captured.length = 0;
    console.log = (...args) => captured.push(JSON.parse(args[0]));
    console.warn = (...args) => captured.push(JSON.parse(args[0]));
    console.error = (...args) => captured.push(JSON.parse(args[0]));
  });

  afterEach(() => {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  });

  it('serializes message, name, stack, and code for meta.error', () => {
    const err = new Error('database connection lost');
    err.statusCode = 500;

    logger.error('request failed', { error: err, requestId: 'req-1' });

    const entry = captured[0];
    expect(entry.msg).toBe('request failed');
    expect(entry.error.message).toBe('database connection lost');
    expect(entry.error.name).toBe('Error');
    expect(entry.error.stack).toContain('database connection lost');
    expect(entry.error.code).toBe(500);
    expect(entry.requestId).toBe('req-1');
  });

  it('serializes Errors passed under meta.err', () => {
    logger.warn('retrying', { err: new TypeError('bad input') });

    expect(captured[0].err.name).toBe('TypeError');
    expect(captured[0].err.message).toBe('bad input');
  });

  it('passes non-Error values and plain metadata through unchanged', () => {
    logger.info('heartbeat', { error: 'string detail', statusCode: 200, n: 3 });

    const entry = captured[0];
    expect(entry.error).toBe('string detail');
    expect(entry.statusCode).toBe(200);
    expect(entry.n).toBe(3);
  });

  it('emits valid JSON with no meta at all', () => {
    logger.info('plain message');

    const entry = captured[0];
    expect(entry.level).toBe('info');
    expect(entry.msg).toBe('plain message');
    expect(entry.timestamp).toBeDefined();
  });
});
