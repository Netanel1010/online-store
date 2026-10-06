import type { Server } from 'node:http'

/**
 * Timeouts of the HTTP server, chosen for running behind a proxy (Cloudflare, then Render's load
 * balancer). Node closes an idle keep-alive connection after 5 seconds by default; a proxy that
 * reuses a connection at that very moment sends a request into a closed socket and the visitor
 * gets a `502`. Keeping connections longer than the proxy does removes that race, and the header
 * timeout has to be longer than the keep-alive one for the same reason.
 *
 * `requestTimeout` is how long a client may take to *send* a request (a slow client that holds a
 * connection open is a way to use up a small server); how long the API takes to *answer* is
 * `requestTimeout` in middleware/requestTimeout.ts.
 */
export const SERVER_TIMEOUTS = {
  keepAliveTimeout: 65_000,
  headersTimeout: 66_000,
  requestTimeout: 120_000,
} as const

export function configureServerTimeouts(server: Server): void {
  server.keepAliveTimeout = SERVER_TIMEOUTS.keepAliveTimeout
  server.headersTimeout = SERVER_TIMEOUTS.headersTimeout
  server.requestTimeout = SERVER_TIMEOUTS.requestTimeout
}
