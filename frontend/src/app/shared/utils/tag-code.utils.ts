export const TAG_CODE_CHARSET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TAG_CODE_LENGTH = 3;

/**
 * Normalizes a tag code (trims and converts to uppercase).
 */
export function normalizeTagCode(code?: string | null): string {
  if (!code) return '';
  return code.trim().toUpperCase();
}

/**
 * Validates that a code consists of 3 alphanumeric characters.
 */
export function isValidTagCode(code?: string | null): boolean {
  if (!code) return false;
  return /^[A-Z0-9]{3}$/i.test(code.trim());
}

/**
 * Generates a random 3-character code using the marker-friendly character set.
 */
export function generateRandomTagCode(): string {
  let result = '';
  const charsetLen = TAG_CODE_CHARSET.length;
  for (let i = 0; i < TAG_CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * charsetLen);
    result += TAG_CODE_CHARSET[randomIndex];
  }
  return result;
}

