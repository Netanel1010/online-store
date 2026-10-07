import { randomUUID } from 'node:crypto'
import type { RequestHandler, Response } from 'express'
import type { Logger } from '../lib/logger.ts'

/** What a caller (or a proxy) may name a request: short, and nothing that could break a log line. */
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/

/** The id of the request being handled, for the code that answers it. */
export function getRequestId(res: Response): string | undefined {
  return res.locals.requestId as string | undefined
}

/**
 * Gives every request an id, sends it back in `X-Request-Id`, and writes one log line when the
 * request is over: method, path, status, how long it took and the client's address. A caller that
 * sends its own `X-Request-Id` keeps it (so a request can be followed from the site to the API);
 * anything that is not a plain short token is replaced.
 *
 * What is never logged: the query string (a search is what a visitor typed), headers, cookies,
 * request bodies and tokens. A path holds only product ids and fixed route names. The address is
 * logged on purpose: it is what shows whether `TRUST_PROXY_HOPS` is right (docs/deployment.md).
 *
 * A successful health check is not logged: the host calls it every few seconds, and a log that is
 * mostly those is a log nobody reads. A failed one is.
 */
export function requestLogging(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const sent = req.get('x-request-id')
    const id = sent && VALID_REQUEST_ID.test(sent) ? sent : randomUUID()
    res.locals.requestId = id
    res.set('X-Request-Id', id)

    const startedAt = process.hrtime.bigint()
    let logged = false
    const log = (aborted: boolean) => {
      if (logged) return
      logged = true
      const status = res.statusCode
      const path = req.originalUrl.split('?')[0]!.slice(0, 200)
      if (!aborted && status < 400 && path.startsWith('/api/health')) return

      const fields = {
        requestId: id,
        method: req.method,
        path,
        status,
        durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e5) / 10,
        ip: req.ip,
        ...(aborted && { aborted: true }),
      }
      if (status >= 500) logger.warn?.('request', { ...fields, outcome: 'server error' })
      else if (status >= 400 || aborted) logger.warn?.('request', fields)
      else logger.info?.('request', fields)
    }
    res.once('finish', () => log(false))
    // The client went away before the answer was complete.
    res.once('close', () => log(!res.writableFinished))
    next()
  }
}
