import type { Page, Request } from '@playwright/test'
import { PSU, RAM } from './support/catalog'
import { addToCartFromProductPage, cartLink, favoritesLink, header } from './support/helpers'
import { expect, test } from './support/test'

/**
 * The site no longer loads the whole catalog. Each page asks the API only for what it shows: the
 * products of the cart and the favorites by id, the home sections, the category counts, the
 * suggestions under the search box.
 */

const apiCalls = (page: Page) => {
  const calls: URL[] = []
  page.on('request', (request: Request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/products') || url.pathname === '/api/categories') {
      calls.push(url)
    }
  })
  return calls
}

/**
 * The request every page used to start with: all the products, with nothing to narrow them down and
 * no filter options (a listing page asks for those with its products, `facets=true`).
 */
const isWholeCatalog = (url: URL) =>
  url.pathname === '/api/products' &&
  ![...url.searchParams.keys()].some((key) =>
    ['ids', 'q', 'category', 'brand', 'sale', 'recommended', 'facets'].includes(key),
  )

test.describe('what the pages ask the API for', () => {
  test('the cart asks for the products in it, by id, and not for the whole catalog', async ({
    page,
  }) => {
    await addToCartFromProductPage(page, PSU)
    await addToCartFromProductPage(page, RAM)
    const calls = apiCalls(page)

    await page.goto('cart')

    await expect(page.getByRole('link', { name: PSU.name, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: RAM.name, exact: true })).toBeVisible()
    const lookups = calls.filter((url) => url.searchParams.has('ids'))
    expect(lookups.length).toBeGreaterThan(0)
    for (const lookup of lookups) {
      expect(lookup.searchParams.get('ids')?.split(',').sort()).toEqual([PSU.id, RAM.id].sort())
    }
    expect(calls.filter(isWholeCatalog)).toEqual([])
  })

  test('the favorites ask for the favorite products by id', async ({ page }) => {
    await page.goto(`products/${PSU.id}`)
    await page.getByRole('button', { name: `מועדפים: ${PSU.name}` }).click()
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים, 1 פריטים')
    const calls = apiCalls(page)

    await page.goto('favorites')

    await expect(page.getByRole('heading', { level: 2, name: PSU.name })).toBeVisible()
    const lookups = calls.filter((url) => url.searchParams.has('ids'))
    expect(lookups.length).toBeGreaterThan(0)
    for (const lookup of lookups) expect(lookup.searchParams.get('ids')).toBe(PSU.id)
    expect(calls.filter(isWholeCatalog)).toEqual([])
  })

  test('an empty cart asks for no product at all', async ({ page }) => {
    const calls = apiCalls(page)

    await page.goto('cart')

    await expect(page.getByText('העגלה ריקה')).toBeVisible()
    expect(calls).toEqual([])
  })

  test('the suggestions under the search box are the first five products of the search itself', async ({
    page,
  }) => {
    await page.goto('')
    const suggestion = page.waitForRequest((request) => {
      const { pathname, searchParams } = new URL(request.url())
      return pathname === '/api/products' && searchParams.get('q') === 'intel'
    })

    await header(page).getByRole('searchbox', { name: 'חיפוש מוצרים' }).pressSequentially('intel')

    const params = new URL((await suggestion).url()).searchParams
    expect(params.get('limit')).toBe('5')
    expect(params.has('facets')).toBe(false)
  })

  test('the category links on the products page come from the API counts', async ({ page }) => {
    const calls = apiCalls(page)

    await page.goto('products')

    const nav = page.getByRole('navigation', { name: 'סינון לפי קטגוריה' })
    await expect(nav.getByRole('link', { name: /הכל/ })).toBeVisible()
    expect(calls.filter((url) => url.pathname === '/api/categories')).toHaveLength(1)
    expect(calls.filter(isWholeCatalog)).toEqual([])
  })

  test('a product that has left the catalog is dropped from a cart saved in the browser', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'online-store:cart',
        JSON.stringify({
          state: { items: [{ productId: 'NO-LONGER-SOLD', quantity: 2 }] },
          version: 1,
        }),
      )
    })

    await page.goto('')

    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות')
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('online-store:cart')))
      .not.toContain('NO-LONGER-SOLD')
  })
})
