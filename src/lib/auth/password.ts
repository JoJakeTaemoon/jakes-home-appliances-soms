import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Modern name. Aliased as `comparePassword` below for back-compat with any
 * existing call sites; new code should use `verifyPassword`.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export const comparePassword = verifyPassword;

// Random-password alphabet: omit visually ambiguous chars (0/O, 1/l/I) so
// SMS-delivered passwords are easy for customers to type on a phone.
const RANDOM_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ" +
  "abcdefghijkmnpqrstuvwxyz" +
  "23456789" +
  "!@#$%&*";

/**
 * Generate a cryptographically random password.
 *
 * Default length 10 chars — per UC-AU-05 / UC-AU-06 the SMS-delivered
 * temp password is a 10-char random string. Uses Web Crypto so it works
 * in both Node and Edge runtimes (no Node-specific `crypto` import).
 */
export function generateRandomPassword(length = 10): string {
  if (length <= 0) throw new Error("length must be positive");

  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);

  const alphabetLen = RANDOM_ALPHABET.length;
  let out = "";
  for (let i = 0; i < length; i++) {
    out += RANDOM_ALPHABET[bytes[i] % alphabetLen];
  }
  return out;
}
