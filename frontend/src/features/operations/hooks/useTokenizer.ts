import React from 'react';

/**
 * Delimiter Tokenizer mirroring backend/src/lib/tokenizer.js
 * Regex: /(?:[,;\n]|\.\s+)/
 * Caps at 50 tasks.
 */
export function parseTaskDelimiterInput(input: string): {
  tokens: string[];
  count: number;
  exceedsLimit: boolean;
  shouldSplit: boolean;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { tokens: [], count: 0, exceedsLimit: false, shouldSplit: false };
  }

  // Regex splits on comma, semicolon, newline, or period followed by at least one whitespace
  const splitRegex = /(?:[,;\n]|\.\s+)/;
  const rawParts = input.split(splitRegex);
  const candidates = rawParts
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Splits only if there are >= 2 candidate tokens
  if (candidates.length < 2) {
    return {
      tokens: [trimmed],
      count: 1,
      exceedsLimit: false,
      shouldSplit: false,
    };
  }

  const exceedsLimit = candidates.length > 50;
  return {
    tokens: candidates,
    count: candidates.length,
    exceedsLimit,
    shouldSplit: true,
  };
}

export function useTokenizer(input: string) {
  return React.useMemo(() => parseTaskDelimiterInput(input), [input]);
}
