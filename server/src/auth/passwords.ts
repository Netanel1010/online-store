import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * Password hashing with scrypt, which ships with Node: a memory-hard function made for this, so no
 * library is needed. The parameters are one of the combinations OWASP lists for scrypt (32 MiB,
 * which a small host can afford many times at once). They are written into every hash, so they can
 * be raised for new hashes without breaking the old ones.
 *
 * A stored hash looks like `scrypt$<N>$<r>$<p>$<salt>$<hash>`, the salt and the hash in base64url.
 */
const N = 2 ** 15
const R = 8
const P = 3
const SALT_BYTES = 16
const KEY_BYTES = 64
// scrypt needs 128 * N * r bytes (32 MiB here); the default limit is exactly that, so give it room.
const MAX_MEMORY = 64 * 1024 * 1024
/** Parameters in a stored hash above these are not ours: refuse them instead of spending the memory. */
const MAX_N = 2 ** 17

const deriveKey = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await deriveKey(password.normalize('NFKC'), salt, KEY_BYTES, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEMORY,
  })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

interface ParsedHash {
  n: number
  r: number
  p: number
  salt: Buffer
  key: Buffer
}

function parse(stored: string): ParsedHash | null {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null
  const [n, r, p] = [parts[1], parts[2], parts[3]].map(Number) as [number, number, number]
  const salt = Buffer.from(parts[4] ?? '', 'base64url')
  const key = Buffer.from(parts[5] ?? '', 'base64url')
  const valid =
    Number.isInteger(Math.log2(n)) && n >= 2 && n <= MAX_N && r >= 1 && r <= 16 && p >= 1 && p <= 16
  if (!valid || salt.length === 0 || key.length === 0) return null
  return { n, r, p, salt, key }
}

// What an account that does not exist is checked against, so that logging in with an unknown email
// takes as long as logging in with a wrong password. Made on first use, from random bytes.
let decoy: Promise<string> | undefined

/**
 * Whether `password` is the one `stored` was made from. `null` (no such account) and anything that
 * is not one of our hashes are always `false`, after doing the same work as for a wrong password.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const real = stored === null ? null : parse(stored)
  const target = real ?? parse(await (decoy ??= hashPassword(randomBytes(16).toString('hex'))))!

  const key = await deriveKey(password.normalize('NFKC'), target.salt, target.key.length, {
    N: target.n,
    r: target.r,
    p: target.p,
    maxmem: MAX_MEMORY,
  })
  // timingSafeEqual: the time must not depend on where the first different byte is.
  return real !== null && timingSafeEqual(key, target.key)
}
