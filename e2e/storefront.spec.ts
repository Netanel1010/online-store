import type { Page } from '@playwright/test'
import { BRAND_NAMES, catalog, PSU } from './support/catalog'
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

    await expect(carousel.getByRole('button', { name: /^באנר \d+ מתוך 10$/ })).toHaveCount(10)
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

test.describe('hero banners fit the frame', () => {
  test('no banner is cropped or enlarged: each one fills the frame in its own shape or is shown whole', async ({
    page,
  }) => {
    await page.goto('')
    const carousel = page.getByRole('region', { name: 'באנרים' })
    const total = await carousel.getByRole('button', { name: /^באנר \d+ מתוך \d+$/ }).count()

    for (let index = 0; index < total; index += 1) {
      await carousel.getByRole('button', { name: `באנר ${index + 1} מתוך ${total}` }).click()
      const image = carousel.getByRole('img').first()
      await expect(image).toHaveJSProperty('complete', true)
      const shape = await image.evaluate((img: HTMLImageElement) => {
        const box = img.getBoundingClientRect()
        return {
          natural: img.naturalWidth / img.naturalHeight,
          frame: box.width / box.height,
          fit: getComputedStyle(img).objectFit,
          shownWidth: box.width,
          naturalWidth: img.naturalWidth,
        }
      })
      // "cover" crops whatever does not fit the frame: that is only fine for an image that has the
      // frame's own shape. Anything else must be shown whole.
      const sameShape = Math.abs(shape.natural / shape.frame - 1) < 0.03
      expect(
        sameShape || shape.fit === 'contain',
        `banner ${index + 1}: ${JSON.stringify(shape)}`,
      ).toBe(true)
    }
  })

  test('the first banner fills the frame like the others, with the same frame, arrows and dots', async ({
    page,
  }) => {
    await page.goto('')
    const carousel = page.getByRole('region', { name: 'באנרים' })
    const first = carousel.getByRole('img').first()

    await expect(first).toHaveCSS('object-fit', 'cover')
    const frame = (await first.boundingBox())!
    await carousel.getByRole('button', { name: 'הבא' }).click()
    const second = (await carousel.getByRole('img').first().boundingBox())!
    expect(Math.round(frame.width)).toBe(Math.round(second.width))
    expect(Math.round(frame.height)).toBe(Math.round(second.height))
  })
})

test.describe('products from the API', () => {
  const isApiCall = (path: string) => (request: { url(): string }) =>
    new URL(request.url()).pathname + new URL(request.url()).search === path

  test('the products page asks the API for its listing, not for a data file or the whole catalog', async ({
    page,
  }) => {
    const files: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('products.json')) files.push(request.url())
    })
    const listingRequest = page.waitForRequest((request) => {
      const { pathname, searchParams } = new URL(request.url())
      return pathname === '/api/products' && searchParams.get('facets') === 'true'
    })

    await page.goto('products')

    await listingRequest
    await expect(page.getByRole('article')).toHaveCount(catalog.length)
    expect(files).toEqual([])
  })

  test('a product page asks the API for that product', async ({ page }) => {
    const productRequest = page.waitForRequest(isApiCall(`/api/products/${PSU.id}`))

    await page.goto(`products/${PSU.id}`)

    await productRequest
    await expect(page.getByRole('heading', { level: 1, name: PSU.fullName })).toBeVisible()
  })

  test('the search page asks the API to search, and shows what it answers', async ({ page }) => {
    const searchRequest = page.waitForRequest((request) => {
      const { pathname, searchParams } = new URL(request.url())
      return pathname === '/api/products' && searchParams.get('q') === 'intel'
    })

    await page.goto('search?q=intel')

    const params = new URL((await searchRequest).url()).searchParams
    expect(params.get('category')).toBeNull()
    expect(params.get('facets')).toBe('true')
    const intel = catalog.filter((product) => product.brand === 'intel')
    await expect(page.getByRole('article')).toHaveCount(intel.length)
  })

  test('a category page asks the API for its category, and a filter or sort asks again', async ({
    page,
  }) => {
    const first = page.waitForRequest((request) => {
      const { pathname, searchParams } = new URL(request.url())
      return pathname === '/api/products' && searchParams.get('category') === 'cpu'
    })
    await page.goto('category/cpu')
    expect(new URL((await first).url()).searchParams.getAll('brand')).toEqual([])

    const filtered = page.waitForRequest((request) => {
      const { pathname, searchParams } = new URL(request.url())
      return pathname === '/api/products' && searchParams.getAll('brand').join() === 'intel'
    })
    await page.getByRole('group', { name: 'מותג' }).getByRole('checkbox', { name: /Intel/ }).click()
    expect(new URL((await filtered).url()).searchParams.get('category')).toBe('cpu')

    const sorted = page.waitForRequest((request) => {
      const { pathname, searchParams } = new URL(request.url())
      return pathname === '/api/products' && searchParams.get('sort') === 'price-desc'
    })
    await page.getByRole('combobox', { name: 'מיון' }).selectOption('price-desc')
    expect(new URL((await sorted).url()).searchParams.getAll('brand')).toEqual(['intel'])
  })

  test('the API answers with the same products the data file holds', async ({ request }) => {
    const response = await request.get(
      `http://localhost:${process.env.E2E_API_PORT ?? 4174}/api/products?limit=100`,
    )

    const body = await response.json()
    expect(body).toMatchObject({ page: 1, limit: 100, total: catalog.length, totalPages: 1 })
    expect(body.items.map((product: { id: string }) => product.id).sort()).toEqual(
      catalog.map((product) => product.id).sort(),
    )
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

const brandStrip = (page: Page) => page.getByRole('region', { name: 'מותגים' })
const brandLinks = (page: Page) => brandStrip(page).getByRole('link')

test.describe('home page brand links', () => {
  test('each brand is one link with one name, and its logo is not announced as well', async ({
    page,
  }) => {
    await page.goto('')

    await expect(brandLinks(page)).toHaveCount(Object.keys(BRAND_NAMES).length)
    for (const name of Object.values(BRAND_NAMES)) {
      const link = brandStrip(page).getByRole('link', { name: `מוצרי ${name}`, exact: true })
      await expect(link).toHaveCount(1)
      // The logo inside is decorative: not an image in the accessibility tree, and not a name.
      await expect(link.getByRole('img')).toHaveCount(0)
      await expect(link.locator('img')).toHaveAttribute('alt', '')
    }
  })

  // The strip wraps onto several rows on a phone and keeps one row on a desktop, and the page is
  // right to left. The order Tab takes has to be the order the eye reads: row by row, each row from
  // the right. That order is computed from where the links really are, not from the markup.
  for (const { width, height, rows } of [
    { width: 1440, height: 900, rows: 'one' },
    { width: 375, height: 812, rows: 'several' },
    { width: 320, height: 568, rows: 'several' },
  ] as const) {
    test(`Tab follows the visual order of the logos at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('')
      const links = brandLinks(page)
      await expect(links).toHaveCount(Object.keys(BRAND_NAMES).length)
      expect(await brandStrip(page).evaluate((el) => getComputedStyle(el).direction)).toBe('rtl')

      const placed = await links.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect()
          return {
            name: element.getAttribute('aria-label')!,
            x: box.x,
            centerY: box.y + box.height / 2,
          }
        }),
      )
      const lines: { centerY: number; items: typeof placed }[] = []
      for (const item of [...placed].sort((a, b) => a.centerY - b.centerY)) {
        const line = lines.find((candidate) => Math.abs(candidate.centerY - item.centerY) <= 8)
        if (line) line.items.push(item)
        else lines.push({ centerY: item.centerY, items: [item] })
      }
      // Top row first; inside a row, the right-most logo first.
      const visualOrder = lines.flatMap((line) =>
        [...line.items].sort((a, b) => b.x - a.x).map((item) => item.name),
      )
      // Not vacuous: the layout really has the rows this case is about.
      if (rows === 'one') expect(lines).toHaveLength(1)
      else expect(lines.length).toBeGreaterThanOrEqual(2)
      expect(visualOrder).toHaveLength(Object.keys(BRAND_NAMES).length)

      await links.first().focus()
      const tabOrder: string[] = []
      for (let step = 0; step < visualOrder.length; step++) {
        const focused = page.locator(':focus')
        tabOrder.push((await focused.getAttribute('aria-label'))!)
        // A visible ring, drawn by the keyboard focus.
        await expect(focused).toHaveCSS('outline-width', '2px')
        if (step < visualOrder.length - 1) await page.keyboard.press('Tab')
      }
      expect(tabOrder).toEqual(visualOrder)

      await page.keyboard.press('Shift+Tab')
      await expect(page.locator(':focus')).toHaveAttribute(
        'aria-label',
        visualOrder[visualOrder.length - 2]!,
      )
    })
  }

  test('on the narrowest phone the strip does not scroll sideways and each link is big enough', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('')

    await expect(brandLinks(page)).toHaveCount(Object.keys(BRAND_NAMES).length)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      'the page scrolls sideways',
    ).toBe(false)
    for (const link of await brandLinks(page).all()) {
      const box = (await link.boundingBox())!
      const name = (await link.getAttribute('aria-label')) ?? ''
      expect(box.width, name).toBeGreaterThanOrEqual(24)
      expect(box.height, name).toBeGreaterThanOrEqual(24)
    }
  })

  // ASUS and Samsung have one product each: a listing of one product is not an error or an empty state.
  for (const id of ['asus', 'samsung']) {
    test(`${BRAND_NAMES[id]} opens a listing of its single product`, async ({ page }) => {
      const brand = BRAND_NAMES[id]!
      const products = catalog.filter((product) => product.brand === id)
      expect(products).toHaveLength(1)
      await page.goto('')

      await brandStrip(page)
        .getByRole('link', { name: `מוצרי ${brand}`, exact: true })
        .click()

      await expect(page).toHaveURL(new RegExp(`/online-store/products/?[?]brand=${id}$`))
      await expect(page.getByRole('button', { name: `הסרת מסנן מותג: ${brand}` })).toBeVisible()
      await expect(page.getByRole('article')).toHaveCount(1)
      await expect(page.getByRole('article')).toContainText(products[0]!.name)
      await expect(page.getByText(/לא נמצאו מוצרים|אין מוצרים להצגה/)).toHaveCount(0)
    })
  }
})
