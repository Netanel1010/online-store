import { EmailTakenError, type UserRepository } from '../auth/userRepository.ts'
import type { SessionRepository } from '../auth/sessionRepository.ts'
import type { Session, User } from '../auth/types.ts'

/**
 * A `UserRepository` that keeps the accounts in memory, with the behaviour the real one has: the
 * email and the id are unique, and a second registration of an email fails with `EmailTakenError`.
 * It lets the service, the routes and the end-to-end tests run without MongoDB. The real repository
 * is checked against MongoDB by the optional integration test.
 */
export function createMemoryUserRepository(initial: readonly User[] = []) {
  const stored = new Map<string, User>(initial.map((user) => [user.id, user]))

  const repository: UserRepository = {
    ensureIndexes: () => Promise.resolve(),

    create(user) {
      const taken = [...stored.values()].some(
        (existing) => existing.email === user.email || existing.id === user.id,
      )
      if (taken) return Promise.reject(new EmailTakenError())
      stored.set(user.id, structuredClone(user))
      return Promise.resolve()
    },

    findByEmail(email) {
      const found = [...stored.values()].find((user) => user.email === email)
      return Promise.resolve(found ? structuredClone(found) : null)
    },

    findById(id) {
      const found = stored.get(id)
      return Promise.resolve(found ? structuredClone(found) : null)
    },
  }

  return { repository, stored }
}

/** A `SessionRepository` in memory. It does not remove expired sessions by itself, like MongoDB does. */
export function createMemorySessionRepository() {
  const stored = new Map<string, Session>()

  const repository: SessionRepository = {
    ensureIndexes: () => Promise.resolve(),

    create(session) {
      if (stored.has(session.tokenHash)) return Promise.reject(new Error('duplicate session'))
      stored.set(session.tokenHash, structuredClone(session))
      return Promise.resolve()
    },

    findByTokenHash(tokenHash) {
      const found = stored.get(tokenHash)
      return Promise.resolve(found ? structuredClone(found) : null)
    },

    deleteByTokenHash(tokenHash) {
      stored.delete(tokenHash)
      return Promise.resolve()
    },
  }

  return { repository, stored }
}
