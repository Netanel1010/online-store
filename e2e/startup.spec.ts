import { expect, test } from './support/test'

const API = `http://localhost:${process.env.E2E_API_PORT ?? 4174}`

/** The two product sections of the home page are what it asks the API for. */
const isHomeSection = ({ pathname, searchParams }: URL) =>
  pathname === '/api/products' &&
  (searchParams.get('sale') === 'true' || searchParams.get('recommended') === 'true')

test.describe('the start of every page', () => {
  test('tells the browser about the API in the HTML, before any script runs', async ({
    request,
  }) => {
    const html = await (await request.get('')).text()

    // Open the connection to the API now. No request is started early: every page asks for its own
    // products, so there is no one request that all of them share.
    expect(html).toContain(`<link rel="preconnect" href="${API}" crossorigin="anonymous" />`)
    expect(html).not.toContain('rel="preload"')
    // The catalog no longer comes from a file on the site, so nothing preloads that file.
    expect(html).not.toContain('products.json')
    expect(html).not.toContain('api-hints')
  })

  test('the home page asks the API for its two sections, and never for the whole catalog', async ({
    page,
  }) => {
    const productRequests: string[] = []
    const files: string[] = []
    page.on('request', (request) => {
      const { pathname } = new URL(request.url())
      if (pathname === '/api/products') productRequests.push(request.url())
      if (request.url().includes('products.json')) files.push(request.url())
    })

    await page.goto('')
    await expect(page.getByRole('article').first()).toBeVisible()
    await page.waitForLoadState('networkidle')

    expect(productRequests.sort()).toEqual([
      `${API}/api/products?recommended=true&page=1&limit=100`,
      `${API}/api/products?sale=true&page=1&limit=100`,
    ])
    expect(files).toEqual([])
  })

  test('the home page shows its banner and categories while the API is still answering', async ({
    page,
  }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      (url) => url.pathname === '/api/products',
      async (route) => {
        await gate
        await route.continue()
      },
    )

    await page.goto('')
    // What does not need products is there at once: the banner, the categories, the brands.
    await expect(page.getByRole('region', { name: 'באנרים' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('heading', { name: 'קטגוריות' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('heading', { name: 'מותגים' })).toBeVisible()
    expect(await page.getByRole('article').count()).toBe(0)

    release()
    await expect(page.getByRole('article').first()).toBeVisible()
  })

  test('explains a slow API instead of showing only a placeholder, then shows the products', async ({
    page,
  }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route(isHomeSection, async (route) => {
      await gate
      await route.continue()
    })

    await page.goto('')
    const notice = page.getByRole('status').filter({ hasText: 'הטעינה לוקחת יותר מהרגיל' })
    await expect(notice).toBeVisible({ timeout: 8_000 })
    expect(await page.getByRole('article').count()).toBe(0)

    release()
    await expect(page.getByRole('article').first()).toBeVisible()
    await expect(notice).toHaveCount(0)
  })
})
