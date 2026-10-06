import { z } from 'zod'
import type { Database } from '../db/database.ts'
import type { User } from './types.ts'

const COLLECTION = 'users'

/** What MongoDB's own `_id` is never mixed with: the account's identifier outside is `id`. */
const PROJECTION = { _id: 0 } as const

/** The email is already registered. Thrown by `create`, whichever of two requests got there first. */
export class EmailTakenError extends Error {
  constructor() {
    super('The email is already registered')
    this.name = 'EmailTakenError'
  }
}

/**
 * Everything that knows about MongoDB for accounts: the `users` collection, its queries and its
 * indexes. It takes and returns validated `User`s and knows nothing about HTTP.
 *
 * Two unique indexes are what keeps accounts correct: `id`, and the (lower case) `email`, so two
 * registrations of the same address at the same moment cannot both succeed.
 */
export interface UserRepository {
  /** Creates the unique indexes if they are missing. Safe to call any number of times. */
  ensureIndexes(): Promise<void>
  /** Stores a new account. Throws `EmailTakenError` when the email is already registered. */
  create(user: User): Promise<void>
  /** The account with this email (already normalized), or null. */
  findByEmail(email: string): Promise<User | null>
  findById(id: string): Promise<User | null>
}

const storedUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(1),
  passwordHash: z.string().min(1),
  createdAt: z.date(),
})

/** A stored document must still be a valid account: a bad one is a data problem, not a client error. */
function toUser(document: unknown): User {
  const result = storedUserSchema.safeParse(document)
  if (!result.success) {
    // Never the document: it holds a password hash.
    throw new Error('A stored account does not match the account schema', { cause: result.error })
  }
  return result.data
}

/** MongoDB's answer to a write that breaks a unique index, and which index it was. */
function isDuplicateOn(error: unknown, field: string): boolean {
  const { code, keyPattern } = (error ?? {}) as {
    code?: unknown
    keyPattern?: Record<string, unknown>
  }
  return code === 11000 && keyPattern !== undefined && field in keyPattern
}

export function createUserRepository(database: Database): UserRepository {
  // Looked up when used, not when created: the database is connected before the first request.
  const users = () => database.db().collection<User>(COLLECTION)

  return {
    async ensureIndexes() {
      await Promise.all([
        users().createIndex({ id: 1 }, { unique: true, name: 'id_unique' }),
        users().createIndex({ email: 1 }, { unique: true, name: 'email_unique' }),
      ])
    },

    async create(user) {
      try {
        await users().insertOne({ ...user })
      } catch (error) {
        if (isDuplicateOn(error, 'email')) throw new EmailTakenError()
        throw error
      }
    },

    async findByEmail(email) {
      const document = await users().findOne({ email }, { projection: PROJECTION })
      return document === null ? null : toUser(document)
    },

    async findById(id) {
      const document = await users().findOne({ id }, { projection: PROJECTION })
      return document === null ? null : toUser(document)
    },
  }
}
