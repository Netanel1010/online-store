/**
 * A limit on failed sign-ins for one email, so that a password cannot be guessed at the speed of
 * the network: after five failures within fifteen minutes the email may not try again for
 * fifteen minutes. A success clears the count.
 *
 * It is kept in the memory of the process, which is enough for one small host and costs no
 * database writes, but it has limits that are worth knowing: it starts again with the process,
 * every instance of a scaled-out API would count on its own, and whoever knows an email can keep
 * it blocked (the price of not needing a second identifier). The scrypt cost of every attempt is
 * the other half of the defence. A shared store is the next step if the API ever runs on several
 * instances.
 *
 * The key is the email, not the address of the client: behind a host's proxy the address needs
 * extra configuration to be trusted, and an unknown email is counted like a known one, so a block
 * does not tell whether an account exists.
 */
export interface LoginThrottle {
  /** Seconds until this key may try again, or 0 when it may try now. */
  retryAfter(key: string): number
  failed(key: string): void
  succeeded(key: string): void
}

interface Options {
  maxFailures?: number
  windowMs?: number
  /** The most keys remembered, so the memory used has an end. */
  maxKeys?: number
  now?: () => number
}

interface AttemptRecord {
  failures: number
  /** When the first failure of this count happened. */
  since: number
  /** When the block ends, once there have been too many failures. */
  blockedUntil: number
}

export function createLoginThrottle({
  maxFailures = 5,
  windowMs = 15 * 60 * 1000,
  maxKeys = 10_000,
  now = Date.now,
}: Options = {}): LoginThrottle {
  const records = new Map<string, AttemptRecord>()

  const expired = (record: AttemptRecord, at: number) =>
    record.blockedUntil > 0 ? record.blockedUntil <= at : record.since + windowMs <= at

  function makeRoom(at: number) {
    if (records.size < maxKeys) return
    for (const [key, record] of records) {
      if (expired(record, at)) records.delete(key)
    }
    // Still full: the oldest keys go first (a Map keeps the order of insertion).
    for (const key of records.keys()) {
      if (records.size < maxKeys) break
      records.delete(key)
    }
  }

  return {
    retryAfter(key) {
      const record = records.get(key)
      const at = now()
      if (!record) return 0
      if (expired(record, at)) {
        records.delete(key)
        return 0
      }
      return record.blockedUntil > at ? Math.ceil((record.blockedUntil - at) / 1000) : 0
    },

    failed(key) {
      const at = now()
      let record = records.get(key)
      if (record && expired(record, at)) {
        records.delete(key)
        record = undefined
      }
      // A block that is running is not extended by more failures.
      if (record && record.blockedUntil > at) return

      if (!record) {
        makeRoom(at)
        record = { failures: 0, since: at, blockedUntil: 0 }
        records.set(key, record)
      }
      record.failures += 1
      if (record.failures >= maxFailures) record.blockedUntil = at + windowMs
    },

    succeeded(key) {
      records.delete(key)
    },
  }
}
