/**
 * Password hashing for the DEMO accounts.
 *
 * This only avoids keeping a readable password in localStorage (the legacy site shipped
 * plaintext passwords in a public JSON file). It is NOT real security: everything runs in the
 * visitor's own browser, so anyone with access to that browser can read the stored hashes,
 * delete accounts, or edit the session. Real authentication needs a server.
 */

const ITERATIONS = 100_000
const encoder = new TextEncoder()

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function generateSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)))
}

/** PBKDF2 (SHA-256) of the password with the given salt, as a hex string. */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: ITERATIONS },
    key,
    256,
  )
  return toHex(new Uint8Array(bits))
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const actual = await hashPassword(password, salt)
  // Compare every character so the time does not depend on where the first difference is.
  let difference = actual.length ^ expectedHash.length
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ (expectedHash.charCodeAt(index) || 0)
  }
  return difference === 0
}
