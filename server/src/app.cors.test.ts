import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { listen } from './testing/listen.ts'

const ALLOWED = 'http://localhost:5173'

let api: Awaited<ReturnType<typeof listen>>

beforeAll(async () => {
  api = await listen(createApp({ corsOrigins: [ALLOWED, 'https://shop.example.com'] }))
})
afterAll(() => api.close())

const health = (headers: Record<string, string> = {}, method = 'GET') =>
  fetch(`${api.url}/api/health`, { method, headers })

describe('CORS', () => {
  it('lets a listed origin read the response', async () => {
    const response = await health({ Origin: ALLOWED })

    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED)
    expect(response.headers.get('vary')).toMatch(/Origin/)
  })

  it('gives an origin that is not listed no CORS headers, but the API still answers', async () => {
    const response = await health({ Origin: 'https://evil.example.com' })

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('does not accept a different port or scheme of a listed host', async () => {
    for (const origin of ['http://localhost:3000', 'https://localhost:5173']) {
      const response = await health({ Origin: origin })
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
    }
  })

  it('lets the browser remember a preflight answer, so it is not asked before every request', async () => {
    const response = await health(
      {
        Origin: ALLOWED,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
      'OPTIONS',
    )

    expect(Number(response.headers.get('access-control-max-age'))).toBeGreaterThanOrEqual(60)
  })

  it('answers the preflight request of a listed origin', async () => {
    const response = await health(
      {
        Origin: ALLOWED,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
      'OPTIONS',
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED)
    expect(response.headers.get('access-control-allow-methods')).toMatch(/POST/)
    expect(response.headers.get('access-control-allow-headers')).toMatch(/content-type/i)
  })

  it('does not allow the preflight request of an origin that is not listed', async () => {
    const response = await health(
      { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' },
      'OPTIONS',
    )

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers a request without an Origin, like curl or another server', async () => {
    const response = await health()

    expect(response.status).toBe(200)
  })
})

// The storefront (another origin) signs in with a JSON body and then sends `Authorization: Bearer`
// on its requests, which makes the browser ask first. Authentication does not use cookies, so
// credentials are deliberately not enabled: a page of another origin cannot ride on a session.
describe('CORS for authentication', () => {
  const preflight = (origin: string, headers: string, method = 'POST', path = '/api/auth/login') =>
    fetch(`${api.url}${path}`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': headers,
      },
    })

  it.each([
    ['sign-in', 'POST', '/api/auth/login', 'content-type'],
    ['registration', 'POST', '/api/auth/register', 'content-type'],
    ['sign-out', 'POST', '/api/auth/logout', 'authorization'],
    ['the current user', 'GET', '/api/auth/me', 'authorization'],
    ['a later request with a token', 'GET', '/api/auth/me', 'authorization,content-type'],
    ['placing an order', 'POST', '/api/orders', 'authorization,content-type,idempotency-key'],
    ['reading an order', 'GET', '/api/orders/DEMO-7K2M9QX4', 'authorization'],
    ['reading the cart', 'GET', '/api/cart', 'authorization'],
    ['adding to the cart', 'POST', '/api/cart/items', 'authorization,content-type'],
    ['setting a quantity', 'PUT', '/api/cart/items/GV-N4060', 'authorization,content-type'],
    ['removing a line', 'DELETE', '/api/cart/items/GV-N4060', 'authorization'],
    ['emptying the cart', 'DELETE', '/api/cart', 'authorization'],
  ])(
    'lets a listed origin send %s, with an Authorization header',
    async (_name, method, path, headers) => {
      const response = await preflight(ALLOWED, headers, method, path)

      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED)
      expect(response.headers.get('access-control-allow-methods')).toMatch(new RegExp(method))
      for (const header of headers.split(',')) {
        expect(response.headers.get('access-control-allow-headers')).toMatch(
          new RegExp(header, 'i'),
        )
      }
    },
  )

  it('does not enable credentials: no cookies are used, so none are accepted from another origin', async () => {
    const response = await preflight(ALLOWED, 'authorization,content-type')

    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('refuses the preflight request of an origin that is not listed', async () => {
    const response = await preflight('https://evil.example.com', 'authorization,content-type')

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('lets a listed origin read the answer of the real request, and gives others nothing', async () => {
    // No database is configured here, so the answer is the usual 503: what counts is the headers.
    const listed = await fetch(`${api.url}/api/auth/me`, {
      headers: { Origin: ALLOWED, Authorization: 'Bearer x' },
    })
    const stranger = await fetch(`${api.url}/api/auth/me`, {
      headers: { Origin: 'https://evil.example.com', Authorization: 'Bearer x' },
    })

    expect(listed.headers.get('access-control-allow-origin')).toBe(ALLOWED)
    expect(stranger.headers.get('access-control-allow-origin')).toBeNull()
  })
})
