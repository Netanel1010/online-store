import { randomUUID } from 'node:crypto'
import { createConcurrencyGate, type ConcurrencyGate } from '../lib/concurrencyGate.ts'
import { HttpError } from '../lib/httpError.ts'
import { hashPassword, verifyPassword } from './passwords.ts'
import type { LoginInput, RegisterInput } from './schemas.ts'
import type { SessionRepository } from './sessionRepository.ts'
import type { LoginThrottle } from './throttle.ts'
import { generateToken, hashToken } from './tokens.ts'
import type { AuthContext, PublicUser, SignedIn, User } from './types.ts'
import { EmailTakenError, type UserRepository } from './userRepository.ts'

/** How long a session lasts from the moment of the sign-in. After that the visitor signs in again. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * How many browsers an account may be signed in on at once. Signing in once more ends the oldest
 * session, so a stolen or forgotten token cannot pile up into an unlimited number of live sessions,
 * and the table does not grow without end for one account. Generous for a person: a phone, a laptop,
 * a tablet and several browsers.
 */
export const MAX_SESSIONS_PER_USER = 10

export interface AuthService {
  register(input: RegisterInput): Promise<SignedIn>
  login(input: LoginInput): Promise<SignedIn>
  /** The account a token belongs to, or null when the token is not a live session. */
  authenticate(token: string): Promise<AuthContext | null>
  /** Ends the session of a token. Quietly does nothing when there is none. */
  logout(token: string): Promise<void>
  /** Ends every session of an account, on every device, including the one that asks. */
  logoutAll(userId: string): Promise<void>
}

interface Dependencies {
  users: UserRepository
  sessions: SessionRepository
  throttle: LoginThrottle
  /** Limits how many passwords are hashed at once (the default suits one small host). */
  hashGate?: ConcurrencyGate
  /** How many sessions an account keeps (default `MAX_SESSIONS_PER_USER`). */
  maxSessionsPerUser?: number
  now?: () => Date
}

const toPublic = ({ id, name, email }: User): PublicUser => ({ id, name, email })

/** The same answer for an unknown email and a wrong password, so neither reveals which it was. */
const invalidCredentials = () =>
  new HttpError(401, 'invalid_credentials', 'The email or the password is wrong')

/**
 * The rules of authentication: who may register, how a password is checked, how long a session
 * lasts. It talks to the repositories, never to MongoDB, and knows nothing about Express. A failure
 * the client caused is thrown as an `HttpError`, so the central error handler answers it.
 */
export function createAuthService({
  users,
  sessions,
  throttle,
  hashGate = createConcurrencyGate({ maxConcurrent: 2, maxQueued: 8 }),
  maxSessionsPerUser = MAX_SESSIONS_PER_USER,
  now = () => new Date(),
}: Dependencies): AuthService {
  async function startSession(user: User): Promise<SignedIn> {
    const token = generateToken()
    const createdAt = now()
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS)
    await sessions.create({ tokenHash: hashToken(token), userId: user.id, createdAt, expiresAt })
    // After the new one exists, so that the newest sessions are the ones that stay. A failure here
    // does not undo the sign-in: it is only housekeeping, and the next sign-in does it again.
    await sessions.trimToNewest(user.id, maxSessionsPerUser).catch(() => undefined)
    return { user: toPublic(user), token, expiresAt: expiresAt.toISOString() }
  }

  const emailTaken = () => new HttpError(409, 'email_taken', 'The email is already registered')

  return {
    async register({ name, email, password }) {
      // Registration has to say that an email is taken (there is no email to confirm it by), but
      // it says so before it spends time hashing.
      if ((await users.findByEmail(email)) !== null) throw emailTaken()

      const user: User = {
        id: randomUUID(),
        name,
        email,
        passwordHash: await hashGate.run(() => hashPassword(password)),
        createdAt: now(),
      }
      try {
        await users.create(user)
      } catch (error) {
        // Another request registered the email while this one was hashing: the unique index decides.
        if (error instanceof EmailTakenError) throw emailTaken()
        throw error
      }
      return startSession(user)
    },

    async login({ email, password }) {
      const wait = throttle.retryAfter(email)
      if (wait > 0) {
        throw new HttpError(
          429,
          'too_many_attempts',
          'Too many failed sign-in attempts. Try again later',
          { 'Retry-After': String(wait) },
        )
      }

      const user = await users.findByEmail(email)
      // An unknown email is checked against a decoy, so it takes as long as a wrong password.
      const valid = await hashGate.run(() => verifyPassword(password, user?.passwordHash ?? null))
      if (!user || !valid) {
        throttle.failed(email)
        throw invalidCredentials()
      }

      throttle.succeeded(email)
      return startSession(user)
    },

    async authenticate(token) {
      const tokenHash = hashToken(token)
      const session = await sessions.findByTokenHash(tokenHash)
      if (session === null) return null

      // The database removes expired sessions about once a minute: until then, this decides.
      if (session.expiresAt.getTime() <= now().getTime()) {
        await sessions.deleteByTokenHash(tokenHash)
        return null
      }
      const user = await users.findById(session.userId)
      if (user === null) {
        await sessions.deleteByTokenHash(tokenHash)
        return null
      }
      return { user: toPublic(user), tokenHash }
    },

    async logout(token) {
      await sessions.deleteByTokenHash(hashToken(token))
    },

    async logoutAll(userId) {
      await sessions.deleteAllForUser(userId)
    },
  }
}
