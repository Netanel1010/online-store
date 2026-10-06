import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { configureServerTimeouts, SERVER_TIMEOUTS } from './serverTimeouts.ts'

describe('configureServerTimeouts', () => {
  it('applies the timeouts to the server', () => {
    const server = createServer()

    configureServerTimeouts(server)

    expect(server.keepAliveTimeout).toBe(SERVER_TIMEOUTS.keepAliveTimeout)
    expect(server.headersTimeout).toBe(SERVER_TIMEOUTS.headersTimeout)
    expect(server.requestTimeout).toBe(SERVER_TIMEOUTS.requestTimeout)
  })

  it('keeps connections open longer than a proxy keeps its own (60 s), so a reused connection is never closed under it', () => {
    expect(SERVER_TIMEOUTS.keepAliveTimeout).toBeGreaterThan(60_000)
  })

  it('has a header timeout longer than the keep-alive one, and a request timeout that is not shorter than the header one', () => {
    expect(SERVER_TIMEOUTS.headersTimeout).toBeGreaterThan(SERVER_TIMEOUTS.keepAliveTimeout)
    expect(SERVER_TIMEOUTS.requestTimeout).toBeGreaterThanOrEqual(SERVER_TIMEOUTS.headersTimeout)
  })
})
