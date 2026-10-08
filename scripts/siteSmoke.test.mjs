import { siteProblems } from './siteSmoke.mjs'

const base = 'https://owner.github.io/online-store/'
const sku = 'CC-9011240-WW'

/** The answers of a site that is deployed as it should be. */
function good() {
  return {
    base,
    sku,
    home: {
      status: 200,
      type: 'text/html; charset=utf-8',
      text: '<script src="/online-store/assets/index-abc.js"></script><div id="root"></div>',
    },
    product: {
      status: 200,
      type: 'text/html; charset=utf-8',
      text: `<link rel="canonical" href="${base}products/${sku}/" /><script type="application/ld+json">{}</script>`,
    },
    sitemap: {
      status: 200,
      type: 'application/xml',
      text: `<urlset><url><loc>${base}products/${sku}/</loc></url></urlset>`,
    },
    unknown: {
      status: 404,
      type: 'text/html; charset=utf-8',
      text: '<meta name="robots" content="noindex, follow" />',
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
    answers.home = { ...answers.home, text: '<html></html>' }
    const problems = siteProblems(answers)
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('no <div id="root">')
    expect(problems[1]).toContain('/online-store/assets/')
  })

  it('reports a site built for another base path', () => {
    const answers = good()
    answers.home = { ...answers.home, text: '<script src="/assets/a.js"></script><div id="root">' }
    expect(siteProblems(answers)).toEqual([expect.stringContaining('/online-store/assets/')])
  })

  it('reports a product page without its canonical address or structured data', () => {
    const answers = good()
    answers.product = { ...answers.product, text: '<title>x</title>' }
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
    answers.unknown = { status: 200, type: 'text/html', text: '<div id="root"></div>' }
    expect(siteProblems(answers)).toEqual([
      expect.stringContaining('answers 200, not 404'),
      expect.stringContaining('not marked noindex'),
    ])
  })

  it('reports a page that is not HTML', () => {
    const answers = good()
    answers.home = { ...answers.home, type: 'application/json' }
    expect(siteProblems(answers)).toEqual(['the home page is not HTML'])
  })
})
