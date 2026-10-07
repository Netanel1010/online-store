import { HttpError } from './httpError.ts'

export interface ConcurrencyGate {
  /** Runs the task now, after the ones ahead of it, or not at all (503) when the line is full. */
  run<T>(task: () => Promise<T>): Promise<T>
}

interface Options {
  /** How many tasks may run at once. */
  maxConcurrent: number
  /** How many may wait for their turn. */
  maxQueued: number
  /** What the client is told to wait when the line is full, in seconds. */
  retryAfterSeconds?: number
}

/**
 * Lets only a few expensive tasks run at once and a few more wait, and turns the rest away with
 * `503 server_busy`. Hashing a password takes a lot of memory and CPU on purpose; without a limit
 * a burst of sign-ins would run all at once on a small host, slow every other request to a crawl or
 * run it out of memory. Shedding the excess keeps the server answering and tells the client to
 * come back, instead of making everyone wait.
 */
export function createConcurrencyGate({
  maxConcurrent,
  maxQueued,
  retryAfterSeconds = 2,
}: Options): ConcurrencyGate {
  let running = 0
  const waiting: (() => void)[] = []

  const busy = () =>
    new HttpError(503, 'server_busy', 'The server is busy. Try again in a moment', {
      'Retry-After': String(retryAfterSeconds),
    })

  function release() {
    const next = waiting.shift()
    if (next) next()
    else running -= 1
  }

  return {
    async run(task) {
      if (running >= maxConcurrent) {
        if (waiting.length >= maxQueued) throw busy()
        // The turn is handed over without freeing the place, so the count never dips in between.
        await new Promise<void>((resolve) => waiting.push(resolve))
      } else {
        running += 1
      }
      try {
        return await task()
      } finally {
        release()
      }
    },
  }
}
