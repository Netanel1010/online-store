import { hardeningProblems } from './apiHardening.mjs'

const headers = (entries) => new Headers(entries)

/** The answers of an API that is configured as it should be. */
function good() {
  return {
    https: true,
    product: headers({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'cache-control': 'public, max-age=60, stale-while-revalidate=3600',
      'access-control-expose-headers': 'Retry-After, X-Request-Id',
      'x-request-id': '3f2a9c1e-7b4d-4e1a-9c55-0a1b2c3d4e5f',
    }),
    missing: headers({ 'cache-control': 'no-store' }),
    preflight: headers({
      'access-control-allow-methods': 'GET,HEAD,POST',
      'access-control-allow-headers': 'Authorization,Content-Type',
      'access-control-max-age': '600',
    }),
  }
}

describe('hardeningProblems', () => {
  it('finds nothing wrong with an API that is configured as it should be', () => {
    expect(hardeningProblems(good())).toEqual([])
  })

  it.each([
    ['nosniff', 'x-content-type-options', /nosniff/],
    ['the referrer policy', 'referrer-policy', /Referrer-Policy/],
    ['the content security policy', 'content-security-policy', /Content-Security-Policy/],
    ['HSTS over HTTPS', 'strict-transport-security', /Strict-Transport-Security/],
    ['caching of a product', 'cache-control', /stale-while-revalidate/],
    ['reading Retry-After', 'access-control-expose-headers', /Retry-After/],
    ['a request id', 'x-request-id', /X-Request-Id/],
  ])('says when %s is missing', (_name, header, message) => {
    const answers = good()
    answers.product.delete(header)

    expect(hardeningProblems(answers)).toEqual([expect.stringMatching(message)])
  })

  it('does not ask for HSTS when the API was not reached over HTTPS', () => {
    const answers = { ...good(), https: false }
    answers.product.delete('strict-transport-security')

    expect(hardeningProblems(answers)).toEqual([])
  })

  it('says when the framework is named', () => {
    const answers = good()
    answers.product.set('x-powered-by', 'Express')

    expect(hardeningProblems(answers)).toEqual([expect.stringMatching(/X-Powered-By/)])
  })

  it('says when an error can be cached', () => {
    const answers = good()
    answers.missing.delete('cache-control')

    expect(hardeningProblems(answers)).toEqual([expect.stringMatching(/no-store/)])
  })

  it('says when the preflight allows methods the site never uses, or too few', () => {
    const tooMany = good()
    tooMany.preflight.set('access-control-allow-methods', 'GET,HEAD,PUT,PATCH,POST,DELETE')
    const tooFew = good()
    tooFew.preflight.set('access-control-allow-methods', 'GET')

    expect(hardeningProblems(tooMany)).toEqual([expect.stringMatching(/PUT, PATCH or DELETE/)])
    expect(hardeningProblems(tooFew)).toEqual([expect.stringMatching(/GET and POST/)])
  })

  it('says when the preflight is not cached or refuses the Authorization header', () => {
    const answers = good()
    answers.preflight.delete('access-control-max-age')
    answers.preflight.set('access-control-allow-headers', 'Content-Type')

    expect(hardeningProblems(answers)).toEqual([
      expect.stringMatching(/Authorization/),
      expect.stringMatching(/Access-Control-Max-Age/),
    ])
  })

  it('reports every problem of an API that has none of it (as the one deployed before this change)', () => {
    const before = {
      https: true,
      product: headers({}),
      missing: headers({}),
      preflight: headers({
        'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
        'access-control-allow-headers': 'authorization,content-type',
      }),
    }

    expect(hardeningProblems(before).length).toBeGreaterThanOrEqual(10)
  })
})
