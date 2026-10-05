import { catalog, PSU } from './support/catalog'
import { header } from './support/helpers'
import { expect, test } from './support/test'

test.describe('home page', () => {
  test('loads with its main sections', async ({ page }) => {
    await page.goto('')

    await expect(page).toHaveTitle(/N\.M\.S/)
    await expect(page.getByRole('heading', { level: 1, name: 'חנות רכיבי מחשב' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'באנרים' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'קטגוריות' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'מותגים' })).toBeVisible()
    await expect(header(page).getByRole('link', { name: 'N.M.S - לדף הבית' })).toBeVisible()
  })

  test('shows the sale and recommended products from the catalog', async ({ page }) => {
    await page.goto('')

    const onSale = catalog.filter((product) => product.price.original !== undefined)
    const recommended = page.getByRole('region', { name: 'מומלצים' })
    await expect(page.getByRole('region', { name: 'מבצעים' }).getByRole('article')).toHaveCount(
      onSale.length,
    )
    await expect(recommended.getByRole('article').first()).toBeVisible()
  })

  test('loads its images from the /online-store/ base path', async ({ page }) => {
    await page.goto('')

    const hero = page.getByRole('region', { name: 'באנרים' }).getByRole('img').first()
    await expect(hero).toBeVisible()
    await expect(hero).toHaveJSProperty('complete', true)
    expect(await hero.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    await expect(hero).toHaveAttribute('src', /^\/online-store\/images\/hero\//)
  })

  test('carousel moves with its buttons and stays on the chosen slide', async ({ page }) => {
    await page.goto('')
    const carousel = page.getByRole('region', { name: 'באנרים' })
    const firstAlt = await carousel.getByRole('img').first().getAttribute('alt')

    await expect(carousel.getByRole('button', { name: /^באנר \d+ מתוך 8$/ })).toHaveCount(8)
    await carousel.getByRole('button', { name: 'הבא' }).click()
    await expect(carousel.getByRole('img').first()).not.toHaveAttribute('alt', firstAlt ?? '')
    await carousel.getByRole('button', { name: 'הקודם' }).click()
    await expect(carousel.getByRole('img').first()).toHaveAttribute('alt', firstAlt ?? '')
  })

  test('with reduced motion the carousel does not rotate and has no pause button', async ({
    page,
  }) => {
    await page.goto('')
    const carousel = page.getByRole('region', { name: 'באנרים' })
    const firstAlt = await carousel.getByRole('img').first().getAttribute('alt')

    await page.waitForTimeout(5000)

    await expect(carousel.getByRole('img').first()).toHaveAttribute('alt', firstAlt ?? '')
    await expect(carousel.getByRole('button', { name: /מעבר אוטומטי/ })).toHaveCount(0)
  })
})

test.describe('home page carousel autoplay', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('rotates by itself, pauses on hover and from the pause button', async ({ page }) => {
    await page.goto('')
    const carousel = page.getByRole('region', { name: 'באנרים' })
    const currentAlt = () => carousel.getByRole('img').first().getAttribute('alt')
    const firstAlt = await currentAlt()

    await expect(carousel.getByRole('img').first()).not.toHaveAttribute('alt', firstAlt ?? '', {
      timeout: 8000,
    })

    // Hovering holds the slide still.
    await carousel.hover()
    const held = await currentAlt()
    await page.waitForTimeout(5000)
    expect(await currentAlt()).toBe(held)

    // The pause button stops it for good, also once the pointer has left.
    await page.mouse.move(0, 0)
    await carousel.getByRole('button', { name: 'השהיית מעבר אוטומטי בין הבאנרים' }).click()
    await page.mouse.move(0, 0)
    const paused = await currentAlt()
    await page.waitForTimeout(5000)
    expect(await currentAlt()).toBe(paused)
    await expect(
      carousel.getByRole('button', { name: 'הפעלת מעבר אוטומטי בין הבאנרים' }),
    ).toBeVisible()
  })
})

test.describe('product listing', () => {
  test('lists every product of the catalog', async ({ page }) => {
    await page.goto('products')

    await expect(page.getByRole('heading', { level: 1, name: 'כל המוצרים' })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(catalog.length)
    await expect(page.getByText(`${catalog.length} מוצרים`, { exact: true })).toBeVisible()
  })

  test('shows the name, price and brand of a product on its card', async ({ page }) => {
    await page.goto('products')

    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('link', { name: PSU.name }) })
    await expect(card.getByRole('img', { name: 'Gigabyte' })).toBeVisible()
    await expect(card).toContainText(PSU.id)
    await expect(card).toContainText(String(PSU.price.current))
  })

  test('navigates between categories from the category chips', async ({ page }) => {
    await page.goto('products')

    await page
      .getByRole('navigation', { name: 'סינון לפי קטגוריה' })
      .getByRole('link', { name: /מעבדים/ })
      .click()

    await expect(page).toHaveURL(/\/online-store\/category\/cpu$/)
    await expect(page.getByRole('heading', { level: 1, name: 'מעבדים' })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(
      catalog.filter((product) => product.category === 'cpu').length,
    )
  })
})

test.describe('direct and deep routes under /online-store/', () => {
  const routes: { path: string; heading: string | RegExp }[] = [
    { path: '', heading: 'חנות רכיבי מחשב' },
    { path: 'products', heading: 'כל המוצרים' },
    { path: `products/${PSU.id}`, heading: PSU.fullName },
    { path: 'category/cpu', heading: 'מעבדים' },
    { path: 'search?q=intel', heading: /תוצאות חיפוש עבור/ },
    { path: 'cart', heading: 'עגלת קניות' },
    { path: 'favorites', heading: 'מועדפים' },
    { path: 'login', heading: 'התחברות' },
    { path: 'register', heading: 'הרשמה' },
  ]

  for (const { path, heading } of routes) {
    test(`opens /online-store/${path} directly`, async ({ page }) => {
      await page.goto(path)

      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      // Pages that have their own HTML file are served from a folder, so the address may end
      // with a slash.
      const end = path.includes('?') ? '' : '/?'
      await expect(page).toHaveURL(new RegExp(`/online-store/${path.replace('?', '\\?')}${end}$`))
    })
  }

  test('serves deep links through the 404.html fallback, like GitHub Pages', async ({ page }) => {
    const response = await page.goto('cart')

    // The static host has no file for the cart, so it answers with 404.html (and a 404 status);
    // the app inside it reads the URL and renders the right page anyway.
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'עגלת קניות' })).toBeVisible()
  })

  test('serves a product page from its own file, so it can be indexed', async ({ page }) => {
    const response = await page.goto(`products/${PSU.id}`)

    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: PSU.fullName })).toBeVisible()
  })

  test('keeps the page after a reload', async ({ page }) => {
    await page.goto('category/cpu')
    await page.reload()

    await expect(page.getByRole('heading', { level: 1, name: 'מעבדים' })).toBeVisible()
  })

  test('shows a not-found page for an unknown route', async ({ page }) => {
    await page.goto('no/such/page')

    await expect(page.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeVisible()
    await page.getByRole('link', { name: 'חזרה לדף הבית' }).click()
    await expect(page).toHaveURL(/\/online-store\/$/)
  })

  test('does not support the legacy .html URLs', async ({ page }) => {
    await page.goto('product%20page.html?id=GP-P650G')

    await expect(page.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeVisible()
  })

  test('shows a message for an unknown product and an unknown category', async ({ page }) => {
    await page.goto('products/NO-SUCH-SKU')
    await expect(page.getByRole('heading', { level: 1, name: 'המוצר לא נמצא' })).toBeVisible()

    await page.goto('category/no-such-category')
    await expect(page.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeVisible()
  })
})
