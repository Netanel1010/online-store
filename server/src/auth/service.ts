import { randomUUID } from 'node:crypto'
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

export interface AuthService {
  register(input: RegisterInput): Promise<SignedIn>
  login(input: LoginInput): Promise<SignedIn>
  /** The account a token belongs to, or null when the token is not a live session. */
  authenticate(token: string): Promise<AuthContext | null>
  /** Ends the session of a token. Quietly does nothing when there is none. */
  logout(token: string): Promise<void>
}

interface Dependencies {
  users: UserRepository
  sessions: SessionRepository
  throttle: LoginThrottle
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
  now = () => new Date(),
}: Dependencies): AuthService {
  async function startSession(user: User): Promise<SignedIn> {
    const token = generateToken()
    const createdAt = now()
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS)
    await sessions.create({ tokenHash: hashToken(token), userId: user.id, createdAt, expiresAt })
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
        passwordHash: await hashPassword(password),
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
      const valid = await verifyPassword(password, user?.passwordHash ?? null)
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
  }
}
