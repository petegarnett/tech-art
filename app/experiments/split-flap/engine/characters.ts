// The character sequence on the split-flap drum
// Space is first (blank), then A-Z, 0-9, then symbols
export const CHAR_SEQUENCE = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:!?-+\'"/()@#';

// Pre-compute index lookup for performance
const CHAR_INDEX = new Map<string, number>();
for (let i = 0; i < CHAR_SEQUENCE.length; i++) {
  CHAR_INDEX.set(CHAR_SEQUENCE[i], i);
}

/**
 * Get the index of a character in the sequence.
 * Returns 0 (space) for unknown characters.
 */
export function getCharIndex(char: string): number {
  return CHAR_INDEX.get(char) ?? 0;
}

/**
 * Get the number of flips needed to go from one character to another.
 * Split-flaps can only go forward through the sequence (like a drum).
 * If target is before current in the sequence, it wraps around.
 */
export function getFlipCount(from: string, to: string): number {
  if (from === to) return 0;
  const fromIdx = getCharIndex(from);
  const toIdx = getCharIndex(to);
  if (toIdx > fromIdx) {
    return toIdx - fromIdx;
  }
  // Wrap around
  return CHAR_SEQUENCE.length - fromIdx + toIdx;
}

/**
 * Get the character at a given number of steps forward from the current character.
 */
export function getCharAtStep(from: string, steps: number): string {
  const fromIdx = getCharIndex(from);
  const targetIdx = (fromIdx + steps) % CHAR_SEQUENCE.length;
  return CHAR_SEQUENCE[targetIdx];
}

/**
 * Convert a string to a board-compatible format:
 * - Uppercase
 * - Replace unsupported chars with space
 * - Pad/truncate to fit
 */
export function sanitizeText(text: string, maxLength: number): string {
  const upper = text.toUpperCase();
  let result = '';
  for (let i = 0; i < upper.length && result.length < maxLength; i++) {
    const ch = upper[i];
    if (CHAR_INDEX.has(ch)) {
      result += ch;
    } else {
      result += ' ';
    }
  }
  // Pad with spaces to fill
  while (result.length < maxLength) {
    result += ' ';
  }
  return result;
}
