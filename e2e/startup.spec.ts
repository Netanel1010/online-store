import { expect, test } from './support/test'

const API = `http://localhost:${process.env.E2E_API_PORT ?? 4174}`
const CATALOG = `${API}/api/products?page=1&limit=100`

test.describe('the start of every page', () => {
  test('tells the browser about the API in the HTML, before any script runs', async ({
    request,
  }) => {
    const html = await (await request.get('')).text()

    // Open the connection to the API now, and start the catalog request that every page needs.
    expect(html).toContain(`<link rel="preconnect" href="${API}" crossorigin="anonymous" />`)
    expect(html).toContain(
      `<link rel="preload" as="fetch" href="${API}/api/products?page=1&amp;limit=100" crossorigin="anonymous" />`,
    )
    // The catalog no longer comes from a file on the site, so nothing preloads that file.
    expect(html).not.toContain('products.json')
    expect(html).not.toContain('api-hints')
  })

  test('asks the API for the catalog once: the early request is the one the app uses', async ({
    page,
  }) => {
    const catalogRequests: string[] = []
    const files: string[] = []
    page.on('request', (request) => {
      if (request.url() === CATALOG) catalogRequests.push(request.url())
      if (request.url().includes('products.json')) files.push(request.url())
    })

    await page.goto('')
    await expect(page.getByRole('article').first()).toBeVisible()
    await page.waitForLoadState('networkidle')

    expect(catalogRequests).toHaveLength(1)
    expect(files).toEqual([])
  })

  test('the home page shows its banner and sections while the API is still answering', async ({
    page,
  }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route(CATALOG, async (route) => {
      await gate
      await route.continue()
    })

    await page.goto('')
    // What does not need the catalog is there at once: the banner, the categories, the brands.
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
    await page.route(CATALOG, async (route) => {
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
