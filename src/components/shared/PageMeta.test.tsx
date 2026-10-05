import { render } from '@testing-library/react'
import { homeMeta, noindexMeta, pageUrl, productMeta, searchMeta } from '@/lib/seo'
import { makeProduct } from '@/test/fixtures'
import { PageMeta } from './PageMeta'

const META = 'meta[name="description"]'
const CANONICAL = 'link[rel="canonical"]'
const ROBOTS = 'meta[name="robots"]'
const OG_TITLE = 'meta[property="og:title"]'
const OG_IMAGE = 'meta[property="og:image"]'
const JSON_LD = 'script[type="application/ld+json"]'

const query = (selector: string) => document.head.querySelectorAll(selector)
const content = (selector: string) => document.head.querySelector(selector)?.getAttribute('content')

/** What the HTML of the page contains before the app runs: the tags written at build time. */
function seedStaticHead() {
  document.head.innerHTML = `
    <title>Static title</title>
    <meta name="description" content="Static description" />
    <link rel="canonical" href="https://example.test/static/" />
    <meta property="og:title" content="Static title" />
    <script type="application/ld+json">{"@type":"Product"}</script>`
  document.title = 'Static title'
}

beforeEach(seedStaticHead)
afterEach(() => {
  document.head.innerHTML = ''
})

describe('PageMeta', () => {
  it('sets the title and updates the tags in place, without adding second copies', () => {
    render(<PageMeta meta={homeMeta()} />)

    expect(document.title).toBe('N.M.S | חנות רכיבי מחשב')
    expect(query('title')).toHaveLength(1)
    expect(query(META)).toHaveLength(1)
    expect(content(META)).toBe(homeMeta().description)
    expect(query(CANONICAL)).toHaveLength(1)
    expect(document.head.querySelector(CANONICAL)).toHaveAttribute('href', pageUrl(''))
    expect(query(OG_TITLE)).toHaveLength(1)
    expect(content(OG_TITLE)).toBe('N.M.S | חנות רכיבי מחשב')
  })

  it('marks a page without an address as noindex and removes the canonical address', () => {
    render(<PageMeta meta={searchMeta('intel')} />)

    expect(content(ROBOTS)).toBe('noindex, follow')
    expect(query(CANONICAL)).toHaveLength(0)
    expect(document.title).toBe('חיפוש: intel | N.M.S')
  })

  it('gives an indexable page its image and structured data, and no noindex', () => {
    const product = makeProduct({ id: 'P-1', name: 'Card', fullName: 'Card 8GB' })
    render(<PageMeta meta={productMeta(product)} />)

    expect(query(ROBOTS)).toHaveLength(0)
    expect(content(OG_IMAGE)).toContain('/images/products/test/card.webp')
    const scripts = [...query(JSON_LD)]
    expect(scripts).toHaveLength(2)
    expect(JSON.parse(scripts[0]!.textContent!)).toMatchObject({ '@type': 'Product', sku: 'P-1' })
    expect(JSON.parse(scripts[1]!.textContent!)).toMatchObject({ '@type': 'BreadcrumbList' })
  })

  it('removes structured data when the next page has none', () => {
    render(<PageMeta meta={homeMeta()} />)

    expect(query(JSON_LD)).toHaveLength(0)
  })

  it('follows the page when its metadata changes', () => {
    const { rerender } = render(<PageMeta meta={homeMeta()} />)

    rerender(<PageMeta meta={noindexMeta('עגלת קניות')} />)

    expect(document.title).toBe('עגלת קניות | N.M.S')
    expect(content(META)).toContain('עגלת קניות')
    expect(content(ROBOTS)).toBe('noindex, follow')
    expect(query(CANONICAL)).toHaveLength(0)
  })

  it('gives the tags back when the page goes away', () => {
    const { unmount } = render(<PageMeta meta={searchMeta('x')} />)

    unmount()

    expect(content(META)).toBe('Static description')
    expect(query(ROBOTS)).toHaveLength(0)
    expect(document.head.querySelector(CANONICAL)).toHaveAttribute(
      'href',
      'https://example.test/static/',
    )
  })

  it('renders nothing into the page itself', () => {
    const { container } = render(<PageMeta meta={homeMeta()} />)

    expect(container).toBeEmptyDOMElement()
  })
})
