import {
  HEADER_ONLY_DIRECTIVES,
  apiOrigin,
  contentSecurityPolicy,
  contentSecurityPolicyHeader,
  contentSecurityPolicyTag,
  directivesOf,
  policiesOfPage,
  policyProblems,
} from './csp.ts'

const API = 'https://online-store-api.example.com'

describe('apiOrigin', () => {
  it.each([
    ['https://api.example.com', 'https://api.example.com'],
    ['https://api.example.com/', 'https://api.example.com'],
    ['https://api.example.com///', 'https://api.example.com'],
    ['  https://api.example.com/  ', 'https://api.example.com'],
    ['https://api.example.com/v1/some/path?x=1#y', 'https://api.example.com'],
    ['https://api.example.com:8443/', 'https://api.example.com:8443'],
    ['http://localhost:4174', 'http://localhost:4174'],
    ['HTTPS://API.Example.COM/', 'https://api.example.com'],
    ['https://user:secret@api.example.com/', 'https://api.example.com'],
  ])('reads the origin of %j: %s', (value, origin) => {
    expect(apiOrigin(value)).toBe(origin)
  })

  it.each([
    ['nothing', undefined],
    ['an empty value', ''],
    ['spaces', '   '],
    ['text that is not an address', 'not a url'],
    ['a path without a host', '/api'],
    ['a script address', 'javascript:alert(1)'],
    ['a data address', 'data:text/html,hi'],
    ['a file address', 'file:///etc/passwd'],
    ['another protocol', 'ftp://files.example.com'],
    ['a web socket', 'wss://api.example.com'],
  ])('has no origin for %s', (_what, value) => {
    expect(apiOrigin(value)).toBeUndefined()
  })
})

describe('the policy of the pages', () => {
  it('is exactly this, for an API at another address', () => {
    expect(contentSecurityPolicy(API)).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; " +
        `connect-src 'self' ${API}; base-uri 'none'; form-action 'self'`,
    )
  })

  it("lets the page ask only itself when there is no API address: the API is on the site's own host", () => {
    for (const none of [undefined, '', 'not a url', 'javascript:alert(1)']) {
      expect(directivesOf(contentSecurityPolicy(none)).get('connect-src')).toEqual(["'self'"])
    }
  })

  it('takes the address of the API from what the build reads, as an origin only', () => {
    expect(directivesOf(contentSecurityPolicy(`${API}/some/path/`)).get('connect-src')).toEqual([
      "'self'",
      API,
    ])
  })

  it('starts from nothing and lets scripts and styles come from the site only', () => {
    const directives = directivesOf(contentSecurityPolicy(API))

    expect(directives.get('default-src')).toEqual(["'none'"])
    expect(directives.get('script-src')).toEqual(["'self'"])
    expect(directives.get('style-src')).toEqual(["'self'"])
    expect(directives.get('img-src')).toEqual(["'self'"])
  })

  it.each([API, undefined, 'http://localhost:4174'])(
    'allows nothing unsafe or broad, whatever the API address (%s)',
    (api) => {
      const policy = contentSecurityPolicy(api)

      expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|wasm-unsafe-eval/)
      expect(policy).not.toContain('*')
      expect(policy).not.toMatch(/\bdata:|\bblob:|\bfilesystem:/)
      expect(policy).not.toMatch(/\bhttps?:(?=\s|;|$)/)
      expect(policy).not.toMatch(/nonce-|sha256-|strict-dynamic/)
    },
  )

  it('names only the API and the site as places that the page may reach', () => {
    const directives = directivesOf(contentSecurityPolicy(API))
    const sources = [...directives.values()].flat().filter((value) => !value.startsWith("'"))

    expect(sources).toEqual([API])
  })

  it('holds no directive that a <meta> tag cannot carry', () => {
    const directives = directivesOf(contentSecurityPolicy(API))

    for (const name of ['frame-ancestors', 'report-uri', 'report-to', 'sandbox']) {
      expect(directives.has(name), name).toBe(false)
    }
  })

  it('does not depend on the address of the API in anything but the one directive', () => {
    const withApi = directivesOf(contentSecurityPolicy(API))
    const without = directivesOf(contentSecurityPolicy(undefined))
    withApi.delete('connect-src')
    without.delete('connect-src')

    expect(withApi).toEqual(without)
  })
})

describe('the same policy as a header', () => {
  it('is the policy of the pages and the frame rule that only a header can carry', () => {
    expect(HEADER_ONLY_DIRECTIVES).toBe("frame-ancestors 'none'")
    expect(contentSecurityPolicyHeader(API)).toBe(
      `${contentSecurityPolicy(API)}; frame-ancestors 'none'`,
    )
  })

  it('is the policy of the pages in everything else', () => {
    const header = directivesOf(contentSecurityPolicyHeader(API))
    expect(header.get('frame-ancestors')).toEqual(["'none'"])
    header.delete('frame-ancestors')

    expect(header).toEqual(directivesOf(contentSecurityPolicy(API)))
  })
})

describe('the tag in a page', () => {
  it('is a <meta http-equiv> tag with the policy, which is read back from the page', () => {
    const tag = contentSecurityPolicyTag(API)

    expect(tag).toBe(
      `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(API)}" />`,
    )
    expect(policiesOfPage(`<head>${tag}</head>`)).toEqual([contentSecurityPolicy(API)])
  })

  it('is found however the tag is written, and every tag is counted', () => {
    const policy = contentSecurityPolicy(API)

    expect(policiesOfPage('<head></head>')).toEqual([])
    expect(
      policiesOfPage(`<META HTTP-EQUIV="content-security-policy" CONTENT="${policy}">`),
    ).toEqual([policy])
    expect(policiesOfPage(contentSecurityPolicyTag(API).repeat(2))).toEqual([policy, policy])
  })
})

describe('policyProblems', () => {
  const page = (policy: string) =>
    `<head><meta http-equiv="Content-Security-Policy" content="${policy}" /></head>`

  it('finds nothing wrong with a page that has the policy of the build', () => {
    expect(policyProblems(page(contentSecurityPolicy(API)), contentSecurityPolicy(API))).toEqual([])
  })

  it('finds nothing wrong with a deployed page whose build it did not see, when the shape is right', () => {
    expect(policyProblems(page(contentSecurityPolicy(API)))).toEqual([])
  })

  it('says when there is no policy', () => {
    expect(policyProblems('<head></head>')).toEqual(['has no Content-Security-Policy tag'])
  })

  it('says when there are two', () => {
    expect(policyProblems(contentSecurityPolicyTag(API).repeat(2))).toEqual([
      'has 2 Content-Security-Policy tags, not one',
    ])
  })

  it('says when the policy is not the one of the build', () => {
    const problems = policyProblems(
      page(contentSecurityPolicy(undefined)),
      contentSecurityPolicy(API),
    )

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('not the one of this build')
  })

  it.each([
    [
      'inline scripts',
      contentSecurityPolicy(API).replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
    ],
    [
      'eval',
      contentSecurityPolicy(API).replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"),
    ],
    [
      'inline styles',
      contentSecurityPolicy(API).replace("style-src 'self'", "style-src 'self' 'unsafe-inline'"),
    ],
    [
      'a script from a CDN',
      contentSecurityPolicy(API).replace(
        "script-src 'self'",
        "script-src 'self' https://cdn.example.com",
      ),
    ],
    ['any source', contentSecurityPolicy(API).replace("img-src 'self'", 'img-src *')],
    [
      'images from data addresses',
      contentSecurityPolicy(API).replace("img-src 'self'", "img-src 'self' data:"),
    ],
    [
      'a whole scheme',
      contentSecurityPolicy(API).replace("img-src 'self'", "img-src 'self' https:"),
    ],
  ])('says when the policy allows %s', (_what, policy) => {
    expect(policyProblems(page(policy)).length).toBeGreaterThan(0)
  })

  it('says when the policy does not start from nothing, or lets scripts come from elsewhere than the site', () => {
    expect(policyProblems(page("script-src 'self'"))).toContain(
      "does not start from default-src 'none'",
    )
    expect(policyProblems(page("default-src 'none'"))).toContain(
      "allows scripts from somewhere else than 'self'",
    )
  })

  it('says when the tag holds a directive that a tag cannot carry', () => {
    const problems = policyProblems(page(`${contentSecurityPolicy(API)}; frame-ancestors 'none'`))

    expect(problems).toEqual(['has a directive that a <meta> tag cannot carry'])
  })
})
