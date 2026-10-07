import type { ErrorRequestHandler } from 'express'
import { HttpError } from '../lib/httpError.ts'
import type { Logger } from '../lib/logger.ts'
import { getRequestId } from './requestLogging.ts'

export type { Logger }

export interface ErrorBody {
  /** `requestId` is on a server error (5xx): it is what to quote to find it in the log. */
  error: {
    code: string
    message: string
    requestId?: string
    /** Facts a client can act on, only on an error the route threw on purpose with some. */
    details?: Record<string, unknown>
  }
}

/** Errors thrown by Express's own body parser (invalid JSON, a body that is too large). */
function bodyParserError(error: unknown): { status: number; code: string; message: string } | null {
  if (typeof error !== 'object' || error === null || !('type' in error)) return null
  if (error.type === 'entity.parse.failed') {
    return { status: 400, code: 'invalid_json', message: 'The request body is not valid JSON' }
  }
  if (error.type === 'entity.too.large') {
    return { status: 413, code: 'payload_too_large', message: 'The request body is too large' }
  }
  return null
}

/**
 * The one place that turns an error into a response, always with the same JSON shape:
 * `{ "error": { "code": "...", "message": "..." } }`. Expected errors (HttpError, a bad body) keep
 * their status. Anything else is a bug: it is logged with its stack and the client only gets a
 * generic 500, so internals never leak.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    const requestId = getRequestId(res)
    // Too late to change the response: let Express close the connection.
    if (res.headersSent) {
      next(error)
      return
    }

    const known =
      error instanceof HttpError
        ? { status: error.status, code: error.code, message: error.message }
        : bodyParserError(error)

    // An error is never kept by a browser or a proxy: the same request may well work next time.
    res.set('Cache-Control', 'no-store')

    if (known) {
      const body: ErrorBody = {
        error: {
          code: known.code,
          message: known.message,
          ...(known.status >= 500 && requestId && { requestId }),
          ...(error instanceof HttpError &&
            Object.keys(error.details).length > 0 && { details: error.details }),
        },
      }
      if (error instanceof HttpError) res.set(error.headers)
      res.status(known.status).json(body)
      return
    }

    logger.error(error, { requestId })
    const body: ErrorBody = {
      error: {
        code: 'internal_error',
        message: 'Internal server error',
        ...(requestId && { requestId }),
      },
    }
    res.status(500).json(body)
  }
}
