import type { Page } from '@playwright/test'
import { INFO_PAGE_IDS, INFO_PAGES } from '../src/lib/infoPages'
import { catalog, productById } from './support/catalog'
import { expect, test } from './support/test'

const SITE = 'https://netanel1010.github.io/online-store/'

/** The HTML of a page exactly as the server sends it, before any script runs (what crawlers read). */
async function rawHtml(page: Page, path: string) {
  const response = await page.request.get(path)
  return { status: response.status(), html: await response.text() }
}

const tag = (html: string, pattern: RegExp) => pattern.exec(html)?.[1]
const titleOf = (html: string) => tag(html, /<title>([^<]*)<\/title>/)
const canonicalOf = (html: string) => tag(html, /<link rel="canonical" href="([^"]*)"/)

function jsonLdOf(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(
    (match) => JSON.parse(match[1]!),
  )
}

test.describe('static HTML for search engines and link previews', () => {
  test('a product page is served with its own title, description, address and image', async ({
    page,
  }) => {
    const product = productById('GP-P650G')

    const { status, html } = await rawHtml(page, 'products/GP-P650G/')

    expect(status).toBe(200)
    expect(titleOf(html)).toBe(`${product.name} | N.M.S`)
    expect(canonicalOf(html)).toBe(`${SITE}products/GP-P650G/`)
    expect(html).toContain('<html lang="he" dir="rtl">')
    expect(html).toContain(`<meta property="og:image" content="${SITE}${product.images.card}" />`)
    expect(tag(html, /<meta name="description" content="([^"]*)"/)).toContain('GP-P650G')
    expect(html).not.toContain('noindex')
  })

  test('its structured data is the catalog data and claims nothing else', async ({ page }) => {
    const product = productById('GP-P650G')

    const { html } = await rawHtml(page, 'products/GP-P650G/')
    const [productData, breadcrumbs] = jsonLdOf(html)

    expect(productData).toMatchObject({
      '@type': 'Product',
      sku: product.id,
      name: product.fullName,
      brand: { '@type': 'Brand', name: 'Gigabyte' },
      offers: { price: product.price.current, priceCurrency: 'ILS' },
    })
    expect(JSON.stringify(productData)).not.toMatch(/availability|aggregateRating|review/)
    expect(breadcrumbs).toMatchObject({ '@type': 'BreadcrumbList' })
  })

  test('the home page, the product list and a category have their own tags', async ({ page }) => {
    const home = await rawHtml(page, '')
    const products = await rawHtml(page, 'products/')
    const category = await rawHtml(page, 'category/gpu/')

    expect(titleOf(home.html)).toBe('N.M.S | חנות רכיבי מחשב')
    expect(canonicalOf(home.html)).toBe(SITE)
    expect(titleOf(products.html)).toBe('כל המוצרים | N.M.S')
    expect(canonicalOf(products.html)).toBe(`${SITE}products/`)
    expect(titleOf(category.html)).toBe('כרטיסי מסך | N.M.S')
    expect(canonicalOf(category.html)).toBe(`${SITE}category/gpu/`)
    for (const { status } of [home, products, category]) expect(status).toBe(200)
  })

  test('an address without the closing slash is redirected, as on GitHub Pages', async ({
    page,
  }) => {
    const response = await page.request.get('products/GP-P650G', { maxRedirects: 0 })

    expect(response.status()).toBe(301)
    expect(response.headers().location).toBe('/online-store/products/GP-P650G/')
  })

  test('other paths (cart, search, unknown) get the fallback page: noindex, no canonical address', async ({
    page,
  }) => {
    for (const path of ['cart', 'search', 'no-such-page']) {
      const { status, html } = await rawHtml(page, path)

      expect(status, path).toBe(404)
      expect(html, path).toContain('<meta name="robots" content="noindex, follow" />')
      expect(canonicalOf(html), path).toBeUndefined()
    }
  })

  test('the sitemap lists exactly the indexable pages, and every one of them is served', async ({
    page,
  }) => {
    const { status, html } = await rawHtml(page, 'sitemap.xml')
    const urls = [...html.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]!)
    const categories = new Set(catalog.map((product) => product.category))

    expect(status).toBe(200)
    expect(urls).toHaveLength(2 + INFO_PAGE_IDS.length + categories.size + catalog.length)
    for (const id of INFO_PAGE_IDS) expect(urls).toContain(`${SITE}${INFO_PAGES[id].path}/`)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls).toContain(SITE)
    expect(urls).toContain(`${SITE}products/${productById('GP-P650G').id}/`)
    for (const url of urls) {
      expect(url.startsWith(SITE), url).toBe(true)
      expect((await page.request.get(url.slice(SITE.length))).status(), url).toBe(200)
    }
  })
})

test.describe('head tags while navigating', () => {
  const headState = (page: Page) =>
    page.evaluate(() => ({
      titles: document.querySelectorAll('title').length,
      title: document.title,
      descriptions: document.querySelectorAll('meta[name="description"]').length,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
      jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
    }))

  test('keeps one title and one description, and follows each page', async ({ page }) => {
    await page.goto('products/GP-P650G/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await headState(page)).toMatchObject({
      titles: 1,
      descriptions: 1,
      canonical: `${SITE}products/GP-P650G/`,
      robots: null,
      jsonLd: 2,
    })

    await page
      .getByRole('navigation', { name: 'פירורי לחם' })
      .getByRole('link', { name: 'מוצרים' })
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'כל המוצרים' })).toBeVisible()
    await expect
      .poll(() => headState(page))
      .toMatchObject({
        titles: 1,
        descriptions: 1,
        title: 'כל המוצרים | N.M.S',
        canonical: `${SITE}products/`,
        jsonLd: 0,
      })
  })

  test('search results and the cart are not indexable', async ({ page }) => {
    await page.goto('search?q=intel')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await headState(page)).toMatchObject({
      title: 'חיפוש: intel | N.M.S',
      canonical: null,
      robots: 'noindex, follow',
    })

    await page.goto('cart')
    await expect(page.getByRole('heading', { level: 1, name: 'עגלת קניות' })).toBeVisible()
    expect(await headState(page)).toMatchObject({ canonical: null, robots: 'noindex, follow' })
  })

  test('a product page opened from the app has its structured data too', async ({ page }) => {
    await page.goto('products/')
    await page.getByRole('link', { name: productById('GP-P650G').name }).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await expect
      .poll(() => headState(page))
      .toMatchObject({
        canonical: `${SITE}products/GP-P650G/`,
        jsonLd: 2,
        titles: 1,
      })
  })
})
