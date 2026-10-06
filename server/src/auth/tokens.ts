import { createHash, randomBytes } from 'node:crypto'

/**
 * Session tokens: 256 random bits that mean nothing by themselves. The API keeps only their SHA-256
 * digest, so a copy of the database cannot be used to sign in; a fast hash is enough because the
 * token is random and cannot be guessed.
 */
const TOKEN_BYTES = 32
// base64url of 32 bytes: 43 characters. Anything else is not one of ours.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** The token of an `Authorization: Bearer <token>` header, or null when there is not a valid one. */
export function readBearerToken(header: string | undefined): string | null {
  const match = /^Bearer ([^\s]+)$/i.exec(header ?? '')
  const token = match?.[1]
  return token !== undefined && TOKEN_PATTERN.test(token) ? token : null
}
