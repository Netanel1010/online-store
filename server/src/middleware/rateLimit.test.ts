import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
import { createRateLimiter } from './rateLimit.ts'

function setup(options: Partial<Parameters<typeof createRateLimiter>[0]> = {}) {
  let now = 1_000_000
  const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: () => now, ...options })
  /** One request from an address: what the limiter passed on (an error, or nothing). */
  const request = (ip: string | undefined): unknown => {
    let outcome: unknown = 'not called'
    limiter({ ip } as Request, {} as never, (error?: unknown) => {
      outcome = error
    })
    return outcome
  }
  return { request, advance: (ms: number) => (now += ms) }
}

describe('createRateLimiter', () => {
  it('lets a client make as many requests as the limit, then refuses the next with a 429', () => {
    const { request } = setup()

    expect([request('1.1.1.1'), request('1.1.1.1'), request('1.1.1.1')]).toEqual([
      undefined,
      undefined,
      undefined,
    ])
    const refused = request('1.1.1.1')

    expect(refused).toBeInstanceOf(HttpError)
    expect(refused).toMatchObject({ status: 429, code: 'rate_limited' })
  })

  it('says how long to wait, counted down to the end of the window', () => {
    const { request, advance } = setup()
    for (let i = 0; i < 3; i += 1) request('1.1.1.1')

    expect(request('1.1.1.1')).toMatchObject({ headers: { 'Retry-After': '60' } })
    advance(45_500)
    expect(request('1.1.1.1')).toMatchObject({ headers: { 'Retry-After': '15' } })
  })

  it('counts each client on its own', () => {
    const { request } = setup()
    for (let i = 0; i < 3; i += 1) request('1.1.1.1')

    expect(request('1.1.1.1')).toBeInstanceOf(HttpError)
    expect(request('2.2.2.2')).toBeUndefined()
  })

  it('counts the addresses of one IPv6 /64 as one client', () => {
    const { request } = setup()
    for (let i = 0; i < 3; i += 1) request(`2001:db8:1:2::${i + 1}`)

    expect(request('2001:db8:1:2:aaaa::1')).toBeInstanceOf(HttpError)
  })

  it('starts a new window when the old one is over', () => {
    const { request, advance } = setup()
    for (let i = 0; i < 4; i += 1) request('1.1.1.1')

    advance(60_000)

    expect(request('1.1.1.1')).toBeUndefined()
  })

  it('does not extend the block when a client keeps trying', () => {
    const { request, advance } = setup()
    for (let i = 0; i < 3; i += 1) request('1.1.1.1')
    for (let i = 0; i < 50; i += 1) {
      advance(1_000)
      request('1.1.1.1')
    }

    advance(10_001)

    expect(request('1.1.1.1')).toBeUndefined()
  })

  it('counts a request with no address, so it is not a way around the limit', () => {
    const { request } = setup()
    for (let i = 0; i < 3; i += 1) request(undefined)

    expect(request(undefined)).toBeInstanceOf(HttpError)
  })

  it('remembers a limited number of clients, forgetting the oldest first', () => {
    const { request } = setup({ maxKeys: 2, max: 1 })
    request('1.1.1.1')
    request('2.2.2.2')
    expect(request('1.1.1.1')).toBeInstanceOf(HttpError)

    request('3.3.3.3') // makes room: 1.1.1.1 (the oldest) is forgotten

    expect(request('1.1.1.1')).toBeUndefined()
    expect(request('3.3.3.3')).toBeInstanceOf(HttpError)
  })

  it('forgets a window that is over before it forgets a client that is still counted', () => {
    const { request, advance } = setup({ maxKeys: 2, max: 1 })
    request('1.1.1.1')
    advance(30_000)
    request('2.2.2.2')
    advance(30_000) // the window of 1.1.1.1 is over, the one of 2.2.2.2 is not

    request('3.3.3.3')

    expect(request('2.2.2.2')).toBeInstanceOf(HttpError)
  })
})
