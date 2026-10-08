import catalog from '../../public/data/products.json'
import indexHtml from '../../index.html?raw'
import { findCategory } from '@/features/products/categories'
import { productsSchema } from '@/features/products/schema'
import { INFO_PAGE_IDS, INFO_PAGES } from './infoPages'
import { makeProduct } from '@/test/fixtures'
import {
  breadcrumbJsonLd,
  categoryMeta,
  homeMeta,
  infoMeta,
  noindexMeta,
  pageUrl,
  productJsonLd,
  productMeta,
  productsMeta,
  renderSeoTags,
  searchMeta,
  SITE_URL,
} from './seo'

const products = productsSchema.parse(catalog)

describe('pageUrl', () => {
  it('builds absolute URLs below the site root, ending with a slash', () => {
    expect(pageUrl('')).toBe(SITE_URL)
    expect(pageUrl('products')).toBe(`${SITE_URL}products/`)
    expect(pageUrl('/products/GP-P650G/')).toBe(`${SITE_URL}products/GP-P650G/`)
  })

  it('encodes each part of the path', () => {
    expect(pageUrl('products/a b/ü')).toBe(`${SITE_URL}products/a%20b/%C3%BC/`)
  })
})

describe('page metadata', () => {
  it('describes the home page, the product list and the categories', () => {
    expect(homeMeta()).toMatchObject({ title: 'N.M.S | חנות רכיבי מחשב', path: '' })
    expect(productsMeta()).toMatchObject({ title: 'כל המוצרים | N.M.S', path: 'products' })
    const gpu = findCategory('gpu')!
    expect(categoryMeta(gpu)).toMatchObject({ title: 'כרטיסי מסך | N.M.S', path: 'category/gpu' })
  })

  it('says openly that the site is a demo', () => {
    expect(homeMeta().description).toContain('פרויקט הדגמה')
  })

  it('keeps search results and private pages out of the index', () => {
    for (const meta of [searchMeta('intel'), searchMeta(''), noindexMeta('עגלת קניות')]) {
      expect(meta.path).toBeUndefined()
    }
    expect(searchMeta('intel').title).toBe('חיפוש: intel | N.M.S')
    expect(searchMeta('').title).toBe('חיפוש | N.M.S')
    expect(noindexMeta('עגלת קניות').title).toBe('עגלת קניות | N.M.S')
  })

  it('gives every product its own title, description, address and image', () => {
    const titles = new Set<string>()
    const descriptions = new Set<string>()
    for (const product of products) {
      const meta = productMeta(product, findCategory(product.category))
      expect(meta.path).toBe(`products/${product.id}`)
      expect(meta.image).toBe(product.images.card)
      expect(meta.title).toBe(`${product.name} | N.M.S`)
      expect(meta.description).toContain(product.id)
      expect(meta.description).toContain(product.warranty)
      expect(meta.description.length).toBeLessThan(250)
      titles.add(meta.title)
      descriptions.add(meta.description)
    }
    expect(titles.size).toBe(products.length)
    expect(descriptions.size).toBe(products.length)
  })

  it('names the brand once: it is added only when the full name does not contain it', () => {
    const withBrand = makeProduct({ fullName: 'Gigabyte RTX Test', brand: 'gigabyte' })
    const without = makeProduct({ fullName: 'RTX Test 8GB', brand: 'gigabyte' })

    expect(productMeta(withBrand).description.match(/gigabyte/gi)).toHaveLength(1)
    expect(productMeta(without).description).toContain('RTX Test 8GB (Gigabyte)')
  })
})

describe('structured data', () => {
  it('describes each product only with what the catalog says', () => {
    for (const product of products) {
      const data = productJsonLd(product) as Record<string, unknown>
      expect(data).toMatchObject({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.fullName,
        sku: product.id,
        url: pageUrl(`products/${product.id}`),
        offers: { '@type': 'Offer', price: product.price.current, priceCurrency: 'ILS' },
      })
      expect((data.image as string[]).length).toBe(product.images.gallery.length)
      for (const image of data.image as string[]) expect(image).toMatch(/^https:\/\//)
    }
  })

  it('does not claim anything the data does not contain', () => {
    const text = JSON.stringify(productJsonLd(products[0]!))

    for (const invented of ['availability', 'aggregateRating', 'review', 'itemCondition']) {
      expect(text).not.toContain(invented)
    }
  })

  it('lists the breadcrumb of a product in order', () => {
    const product = products.find((p) => p.category === 'gpu')!
    const data = breadcrumbJsonLd(product, findCategory('gpu')) as {
      itemListElement: { position: number; name: string; item: string }[]
    }

    expect(data.itemListElement.map((item) => item.name)).toEqual([
      'בית',
      'מוצרים',
      'כרטיסי מסך',
      product.name,
    ])
    expect(data.itemListElement.map((item) => item.position)).toEqual([1, 2, 3, 4])
    expect(data.itemListElement.at(-1)?.item).toBe(pageUrl(`products/${product.id}`))
  })
})

describe('renderSeoTags', () => {
  it('writes the canonical address and the social tags of an indexable page', () => {
    const html = renderSeoTags(productMeta(products[0]!, findCategory(products[0]!.category)))

    expect(html).toContain('<title>')
    expect(html).toContain('<link rel="canonical" href="https://')
    expect(html).toContain('<meta property="og:image" content="https://')
    expect(html).toContain('<meta property="og:locale" content="he_IL" />')
    expect(html).toContain('type="application/ld+json"')
    expect(html).not.toContain('noindex')
  })

  it('marks a page without an address as noindex and gives it no canonical address', () => {
    const html = renderSeoTags(searchMeta('intel'))

    expect(html).toContain('<meta name="robots" content="noindex, follow" />')
    expect(html).not.toContain('canonical')
    expect(html).not.toContain('og:url')
  })

  it('escapes text so a name can not break out of an attribute or the script element', () => {
    const product = makeProduct({
      name: 'Evil "name" <b>',
      fullName: 'Evil </script><script>alert(1)</script> "x"',
    })
    const html = renderSeoTags(productMeta(product))

    expect(html).not.toContain('</script><script>')
    expect(html).not.toContain('<b>')
    expect(html).toContain('Evil &quot;name&quot; &lt;b&gt;')
    expect(html).toContain('\\u003c/script>')
  })
})

describe('infoMeta', () => {
  it.each(INFO_PAGE_IDS)(
    '%s is an indexable page with its own title, description and address',
    (id) => {
      const meta = infoMeta(id)

      expect(meta.title).toBe(`${INFO_PAGES[id].label} | N.M.S`)
      expect(meta.description).toBe(INFO_PAGES[id].description)
      expect(meta.path).toBe(INFO_PAGES[id].path)
      const html = renderSeoTags(meta)
      expect(html).toContain(`<link rel="canonical" href="${pageUrl(INFO_PAGES[id].path)}" />`)
      expect(html).not.toContain('noindex')
    },
  )

  it('gives no two pages the same title, description or address', () => {
    const metas = INFO_PAGE_IDS.map(infoMeta)
    for (const key of ['title', 'description', 'path'] as const) {
      expect(new Set(metas.map((meta) => meta[key])).size).toBe(metas.length)
    }
  })
})

describe('index.html', () => {
  it('starts with the home page tags that the build writes for it', () => {
    const block = indexHtml.split('<!-- seo:start -->')[1]!.split('<!-- seo:end -->')[0]!
    const normalize = (html: string) => html.replace(/\s+/g, ' ').trim()

    expect(normalize(block)).toBe(normalize(renderSeoTags(homeMeta())))
  })
})
