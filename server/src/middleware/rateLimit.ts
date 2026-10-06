import type { RequestHandler } from 'express'
import { clientKey } from '../lib/clientKey.ts'
import { HttpError } from '../lib/httpError.ts'

export interface RateLimitOptions {
  /** How many requests one client may make within the window. */
  max: number
  windowMs: number
  /** The most clients remembered, so the memory used has an end. */
  maxKeys?: number
  now?: () => number
}

interface Window {
  count: number
  resetAt: number
}

/**
 * A limit on how many requests one client (see `clientKey`) may make within a time window, for the
 * routes that cost the server the most. Past the limit the request is answered with
 * `429 rate_limited` and a `Retry-After`, and never reaches the route.
 *
 * It is kept in the memory of the process, which suits one small host and needs nothing else
 * running, but it has limits worth knowing: the counts start again with the process (a free host
 * that sleeps forgets them), every instance of a scaled-out API would count on its own, and the
 * client is only as exact as the address `req.ip` gives (see `trustProxyHops` in the config: behind
 * a proxy that is wrong unless the proxies are counted). It is one layer: the cost of hashing is
 * limited separately (`concurrencyGate`), and a failed sign-in is limited per email as well.
 */
export function createRateLimiter({
  max,
  windowMs,
  maxKeys = 10_000,
  now = Date.now,
}: RateLimitOptions): RequestHandler {
  const windows = new Map<string, Window>()

  function makeRoom(at: number) {
    if (windows.size < maxKeys) return
    for (const [key, window] of windows) {
      if (window.resetAt <= at) windows.delete(key)
    }
    // Still full: the oldest clients go first (a Map keeps the order of insertion).
    for (const key of windows.keys()) {
      if (windows.size < maxKeys) break
      windows.delete(key)
    }
  }

  return (req, _res, next) => {
    const key = clientKey(req.ip)
    const at = now()
    let window = windows.get(key)
    if (!window || window.resetAt <= at) {
      if (!window) makeRoom(at)
      window = { count: 0, resetAt: at + windowMs }
      windows.set(key, window)
    }
    window.count += 1

    if (window.count > max) {
      const seconds = Math.max(1, Math.ceil((window.resetAt - at) / 1000))
      next(
        new HttpError(429, 'rate_limited', 'Too many requests. Try again later', {
          'Retry-After': String(seconds),
        }),
      )
      return
    }
    next()
  }
}
