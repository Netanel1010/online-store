import { z } from 'zod'
import type { Database } from '../db/database.ts'
import type { Session } from './types.ts'

const COLLECTION = 'sessions'
const PROJECTION = { _id: 0 } as const

/**
 * Everything that knows about MongoDB for sessions: the `sessions` collection and its indexes.
 *
 * A session is found by the digest of its token, which has a unique index. A second index makes
 * MongoDB remove a session by itself once `expiresAt` has passed (it checks about once a minute),
 * so expired sessions do not pile up. The service checks `expiresAt` too, because that removal is
 * not instant. A third, on the account and the time of the sign-in, serves what is asked about an
 * account's sessions: ending all of them, and finding the oldest ones when there are too many.
 */
export interface SessionRepository {
  /** Creates the indexes if they are missing. Safe to call any number of times. */
  ensureIndexes(): Promise<void>
  create(session: Session): Promise<void>
  findByTokenHash(tokenHash: string): Promise<Session | null>
  /** Ends a session. Nothing happens when there is no such session. */
  deleteByTokenHash(tokenHash: string): Promise<void>
  /** Ends every session of an account, and says how many there were. */
  deleteAllForUser(userId: string): Promise<number>
  /**
   * Ends the sessions of an account beyond the `keep` newest (by the time of the sign-in), and says
   * how many it ended. Nothing happens when the account has `keep` sessions or fewer.
   */
  trimToNewest(userId: string, keep: number): Promise<number>
}

const storedSessionSchema = z.object({
  tokenHash: z.string().min(1),
  userId: z.string().min(1),
  createdAt: z.date(),
  expiresAt: z.date(),
})

export function createSessionRepository(database: Database): SessionRepository {
  const sessions = () => database.db().collection<Session>(COLLECTION)

  return {
    async ensureIndexes() {
      await Promise.all([
        sessions().createIndex({ tokenHash: 1 }, { unique: true, name: 'tokenHash_unique' }),
        // expireAfterSeconds: 0 means "at the date in the field".
        sessions().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiresAt_ttl' }),
        // Not unique: an account has many sessions. The newest first is the order trimming needs.
        sessions().createIndex({ userId: 1, createdAt: -1 }, { name: 'userId_createdAt' }),
      ])
    },

    async create(session) {
      await sessions().insertOne({ ...session })
    },

    async findByTokenHash(tokenHash) {
      const document = await sessions().findOne({ tokenHash }, { projection: PROJECTION })
      if (document === null) return null
      const result = storedSessionSchema.safeParse(document)
      if (!result.success) {
        throw new Error('A stored session does not match the session schema', {
          cause: result.error,
        })
      }
      return result.data
    },

    async deleteByTokenHash(tokenHash) {
      await sessions().deleteOne({ tokenHash })
    },

    async deleteAllForUser(userId) {
      const { deletedCount } = await sessions().deleteMany({ userId })
      return deletedCount
    },

    async trimToNewest(userId, keep) {
      // The ones after the newest `keep`. The id breaks a tie between two sign-ins in the same
      // millisecond, so which one is "newer" is never left to chance.
      const surplus = await sessions()
        .find({ userId }, { projection: { _id: 0, tokenHash: 1 } })
        .sort({ createdAt: -1, _id: -1 })
        .skip(keep)
        .toArray()
      if (surplus.length === 0) return 0
      const { deletedCount } = await sessions().deleteMany({
        userId,
        tokenHash: { $in: surplus.map((session) => session.tokenHash) },
      })
      return deletedCount
    },
  }
}
