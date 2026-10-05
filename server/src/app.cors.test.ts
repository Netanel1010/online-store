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
