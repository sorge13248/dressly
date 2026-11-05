export const TAG_CODE_CHARSET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TAG_CODE_LENGTH = 3;

/**
 * Normalizes a tag code (trims and converts to uppercase).
 */
export function normalizeTagCode(code?: string | null): string | null {
  if (!code) return null;
  const trimmed = code.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validates that a code consists of exactly 3 alphanumeric characters.
 */
export function isValidTagCode(code?: string | null): boolean {
  if (!code) return false;
  return /^[A-Z0-9]{3}$/i.test(code.trim());
}

/**
 * Generates a random 3-character code using the marker-friendly character set
 * (excludes ambiguous characters like 0/O, 1/I/L, and U).
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

/**
 * Generates a guaranteed unique 3-character code for an existing set of user codes.
 */
export function generateUniqueTagCode(existingCodes: Set<string>): string {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateRandomTagCode();
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
  }

  // Fallback: systematic traversal of the charset if random collisions occur
  for (let i = 0; i < TAG_CODE_CHARSET.length; i++) {
    for (let j = 0; j < TAG_CODE_CHARSET.length; j++) {
      for (let k = 0; k < TAG_CODE_CHARSET.length; k++) {
        const candidate = `${TAG_CODE_CHARSET[i]}${TAG_CODE_CHARSET[j]}${TAG_CODE_CHARSET[k]}`;
        if (!existingCodes.has(candidate)) {
          return candidate;
        }
      }
    }
  }

  throw new Error('All tag codes in the 3-character space are exhausted for this user.');
}

