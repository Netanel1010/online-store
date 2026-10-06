import type { RequestHandler } from 'express'
import type { ErrorBody } from './errorHandler.ts'

/** Longer than any normal answer, shorter than the host's proxy waits (Render gives up at 100 s). */
export const REQUEST_TIMEOUT_MS = 25_000

/**
 * Answers `503 request_timeout` when a request has had no answer after `timeoutMs`, so a client is
 * told and its connection is released instead of hanging until a proxy gives up on it with a
 * gateway error that says nothing. It does not stop the work: a database call that is still
 * running finishes (the driver has its own time limits), and its result is dropped.
 */
export function requestTimeout(timeoutMs = REQUEST_TIMEOUT_MS): RequestHandler {
  return (_req, res, next) => {
    const timer = setTimeout(() => {
      if (res.headersSent) return
      const body: ErrorBody = {
        error: { code: 'request_timeout', message: 'The request took too long. Try again' },
      }
      res.set({ 'Cache-Control': 'no-store', 'Retry-After': '5' }).status(503).json(body)
    }, timeoutMs)
    // A pending timer must never keep the process alive on its own.
    timer.unref()
    const stop = () => clearTimeout(timer)
    res.once('finish', stop)
    res.once('close', stop)
    next()
  }
}
