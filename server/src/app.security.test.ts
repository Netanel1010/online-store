import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { listen } from './testing/listen.ts'

const SITE = 'https://shop.example.com'

let behindProxy: Awaited<ReturnType<typeof listen>>
let direct: Awaited<ReturnType<typeof listen>>

beforeAll(async () => {
  behindProxy = await listen(createApp({ corsOrigins: [SITE], trustProxyHops: 1 }))
  direct = await listen(createApp({ corsOrigins: [SITE] }))
})
afterAll(async () => {
  await behindProxy.close()
  await direct.close()
})

const get = (api: { url: string }, path = '/api/health', headers: Record<string, string> = {}) =>
  fetch(`${api.url}${path}`, { headers })

describe('security headers', () => {
  it.each([
    ['an answer', '/api/health'],
    ['a 404', '/api/nothing-here'],
    ['a 400', '/api/products?page=0'],
  ])('are on %s', async (_name, path) => {
    const response = await get(behindProxy, path)

    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    )
    expect(response.headers.get('x-frame-options')).toBe('DENY')
  })

  it('are on the answer to a preflight too', async () => {
    const response = await fetch(`${behindProxy.url}/api/auth/login`, {
      method: 'OPTIONS',
      headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST' },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('do not name the framework', async () => {
    expect((await get(direct)).headers.get('x-powered-by')).toBeNull()
  })

  it('tell a browser to use HTTPS only when the request really came over HTTPS', async () => {
    const secure = await get(behindProxy, '/api/health', { 'X-Forwarded-Proto': 'https' })
    const plain = await get(behindProxy, '/api/health', { 'X-Forwarded-Proto': 'http' })
    const none = await get(behindProxy)

    expect(secure.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains',
    )
    expect(plain.headers.get('strict-transport-security')).toBeNull()
    expect(none.headers.get('strict-transport-security')).toBeNull()
  })

  it('cannot be made to pin a host to HTTPS by a header, when no proxy is trusted', async () => {
    const response = await get(direct, '/api/health', { 'X-Forwarded-Proto': 'https' })

    expect(response.headers.get('strict-transport-security')).toBeNull()
  })
})

describe('what is not kept', () => {
  it('is every error: it is marked no-store, with the CORS and security headers intact', async () => {
    for (const path of ['/api/nothing-here', '/api/products?page=0', '/api/auth/me']) {
      const response = await get(behindProxy, path, { Origin: SITE })

      expect(response.status, path).toBeGreaterThanOrEqual(400)
      expect(response.headers.get('cache-control'), path).toBe('no-store')
    }
  })

  it('is the health check', async () => {
    expect((await get(behindProxy)).headers.get('cache-control')).toBe('no-store')
  })
})

describe('CORS', () => {
  it('offers only what the storefront uses: reading, and signing in or out', async () => {
    const response = await fetch(`${behindProxy.url}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: SITE,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    })

    expect(response.headers.get('access-control-allow-origin')).toBe(SITE)
    expect(response.headers.get('access-control-allow-methods')).toBe('GET,HEAD,POST')
    expect(response.headers.get('access-control-allow-headers')).toBe('Authorization,Content-Type')
    expect(Number(response.headers.get('access-control-max-age'))).toBeGreaterThanOrEqual(600)
  })

  it.each(['PUT', 'PATCH', 'DELETE'])('does not allow %s from a browser', async (method) => {
    const response = await fetch(`${behindProxy.url}/api/products`, {
      method: 'OPTIONS',
      headers: { Origin: SITE, 'Access-Control-Request-Method': method },
    })

    expect(response.headers.get('access-control-allow-methods')).not.toContain(method)
  })

  it('does not echo back a header the storefront never sends', async () => {
    const response = await fetch(`${behindProxy.url}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: SITE,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'x-anything-else',
      },
    })

    expect(response.headers.get('access-control-allow-headers')).toBe('Authorization,Content-Type')
  })

  it('lets a page read Retry-After (how long to wait) and X-Request-Id (what to quote)', async () => {
    const response = await get(behindProxy, '/api/health', { Origin: SITE })

    expect(response.headers.get('access-control-expose-headers')).toBe('Retry-After,X-Request-Id')
  })
})
