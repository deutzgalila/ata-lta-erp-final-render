/**
 * Delimiter Tokenizer for Task Creation (P0-D / Spec §3.1 / Rule R4).
 *
 * Tokenizes task input strings on commas, semicolons, newlines, and
 * period followed by space into sibling tasks when >= 2 non-empty tokens result.
 * Enforces a maximum cap of 50 tasks per request.
 * Preserves the original raw string on the returned token array for audit trail logging.
 */

const AppError = require('./AppError');

/**
 * Tokenize a task title/description string into sibling task titles.
 *
 * @param {string} text - The input text to tokenize
 * @param {object} [options]
 * @param {number} [options.max=50] - Maximum allowed tokens across request
 * @param {number} [options.currentTotal=0] - Current token count already accumulated in request
 * @returns {string[]} Array of token strings (with .raw property preserving submitted text)
 */
function tokenizeTask(text, { max = 50, currentTotal = 0 } = {}) {
  if (text === null || text === undefined || typeof text !== 'string') {
    return [];
  }

  const raw = text;
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  // Tokenize on [,;\n] and .  (period followed by one or more whitespace)
  const parts = text.split(/(?:[,;\n]|\.\s+)/);
  const candidates = parts.map((p) => p.trim()).filter((p) => p.length > 0);

  let tokens;
  if (candidates.length >= 2) {
    tokens = candidates;
  } else {
    // 0 or 1 token: return the trimmed text as a single token
    tokens = [trimmed];
  }

  if (currentTotal + tokens.length > max) {
    throw new AppError({
      statusCode: 400,
      title: 'Bad Request',
      detail: `Total tasks exceed limit of ${max} per request`,
      code: 'TASK_LIMIT_EXCEEDED',
    });
  }

  // Preserve original raw submitted string as non-enumerable property
  Object.defineProperty(tokens, 'raw', {
    value: raw,
    enumerable: false,
    writable: true,
  });
  return tokens;
}

module.exports = {
  tokenizeTask,
};
