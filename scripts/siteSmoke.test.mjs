import { contentSecurityPolicy, contentSecurityPolicyTag } from './csp.ts'
import { siteProblems } from './siteSmoke.mjs'

const base = 'https://owner.github.io/online-store/'
const sku = 'CC-9011240-WW'
/** The policy that every page of a deployed site carries (its API address is not known to the check). */
const policy = contentSecurityPolicyTag('https://api.example.com')

/** The answers of a site that is deployed as it should be. */
function good() {
  return {
    base,
    sku,
    home: {
      status: 200,
      type: 'text/html; charset=utf-8',
      text: `${policy}<script src="/online-store/assets/index-abc.js"></script><div id="root"></div>`,
    },
    product: {
      status: 200,
      type: 'text/html; charset=utf-8',
      text: `${policy}<link rel="canonical" href="${base}products/${sku}/" /><script type="application/ld+json">{}</script>`,
    },
    sitemap: {
      status: 200,
      type: 'application/xml',
      text: `<urlset><url><loc>${base}products/${sku}/</loc></url></urlset>`,
    },
    unknown: {
      status: 404,
      type: 'text/html; charset=utf-8',
      text: `${policy}<meta name="robots" content="noindex, follow" />`,
    },
  }
}

describe('siteProblems', () => {
  it('finds nothing wrong with a site that is deployed as it should be', () => {
    expect(siteProblems(good())).toEqual([])
  })

  it('reports a home page that does not answer 200', () => {
    const answers = good()
    answers.home = { ...answers.home, status: 404 }
    expect(siteProblems(answers)).toEqual(['the home page answers 404, not 200'])
  })

  it('reports a home page that does not mount the app', () => {
    const answers = good()
    answers.home = { ...answers.home, text: `${policy}<html></html>` }
    const problems = siteProblems(answers)
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('no <div id="root">')
    expect(problems[1]).toContain('/online-store/assets/')
  })

  it('reports a site built for another base path', () => {
    const answers = good()
    answers.home = {
      ...answers.home,
      text: `${policy}<script src="/assets/a.js"></script><div id="root">`,
    }
    expect(siteProblems(answers)).toEqual([expect.stringContaining('/online-store/assets/')])
  })

  it('reports a product page without its canonical address or structured data', () => {
    const answers = good()
    answers.product = { ...answers.product, text: `${policy}<title>x</title>` }
    const problems = siteProblems(answers)
    expect(problems).toEqual([
      expect.stringContaining('no canonical address'),
      expect.stringContaining('no structured data'),
    ])
  })

  it('reports a sitemap that is missing or does not list the product', () => {
    const answers = good()
    answers.sitemap = { status: 200, type: 'application/xml', text: '<urlset></urlset>' }
    expect(siteProblems(answers)).toEqual([expect.stringContaining('does not list')])
    answers.sitemap = { status: 404, type: 'text/html', text: 'Not found' }
    expect(siteProblems(answers)).toHaveLength(3)
  })

  it('reports an unknown address that answers 200, or is not noindex', () => {
    const answers = good()
    answers.unknown = { status: 200, type: 'text/html', text: `${policy}<div id="root"></div>` }
    expect(siteProblems(answers)).toEqual([
      expect.stringContaining('answers 200, not 404'),
      expect.stringContaining('not marked noindex'),
    ])
  })

  it.each([
    ['home', 'the home page'],
    ['product', `the page of product ${sku}`],
    ['unknown', 'the page for an unknown address'],
  ])('reports a %s page that has no Content-Security-Policy', (which, name) => {
    const answers = good()
    answers[which] = { ...answers[which], text: answers[which].text.replace(policy, '') }
    expect(siteProblems(answers)).toEqual([`${name} has no Content-Security-Policy tag`])
  })

  it('reports a page whose policy lets scripts run from anywhere or inline', () => {
    const answers = good()
    const loose = contentSecurityPolicy('https://api.example.com').replace(
      "script-src 'self'",
      "script-src 'self' 'unsafe-inline'",
    )
    answers.home = {
      ...answers.home,
      text: answers.home.text.replace(
        policy,
        `<meta http-equiv="Content-Security-Policy" content="${loose}" />`,
      ),
    }
    expect(siteProblems(answers)).toEqual([
      "the home page allows scripts from somewhere else than 'self'",
      expect.stringContaining('the home page allows something unsafe or too broad'),
    ])
  })

  it('reports a page that is not HTML', () => {
    const answers = good()
    answers.home = { ...answers.home, type: 'application/json' }
    expect(siteProblems(answers)).toEqual(['the home page is not HTML'])
  })
})
