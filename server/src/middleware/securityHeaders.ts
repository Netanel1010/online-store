import type { RequestHandler } from 'express'

/**
 * The response headers that tell a browser how much to trust what the API sends. They are few on
 * purpose: this API only answers JSON to `fetch`, so there is no page to protect with a long policy.
 *
 * - `X-Content-Type-Options: nosniff`: a response is never reinterpreted as another type.
 * - `Referrer-Policy: no-referrer`: nothing about where a request came from is sent on.
 * - `Content-Security-Policy`: if a response were ever opened as a page, nothing may load or run
 *   in it and it may not be put in a frame.
 * - `X-Frame-Options`: the same "no frames" for browsers that do not read the policy above.
 * - `Strict-Transport-Security`: after one answer over HTTPS the browser refuses plain HTTP to this
 *   host for a year. It is sent only when the request really came over HTTPS (behind the host's
 *   proxy that is what `X-Forwarded-Proto` says, see `trustProxyHops`): over HTTP it would be
 *   ignored anyway, and a local server must never pin `localhost` to HTTPS.
 */
export const securityHeaders: RequestHandler = (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'X-Frame-Options': 'DENY',
  })
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
}
