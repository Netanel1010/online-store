import type { Page } from '@playwright/test'
import { productById } from './support/catalog'
import { expectSignedIn, header, newAccount, register } from './support/helpers'
import { expect, test } from './support/test'

/** The shape of every banner: the carousel frame has it at every width. */
const BANNER_RATIO = 1834 / 788

const PHONES = [
  { name: '320x568', width: 320, height: 568 },
  { name: '360x800', width: 360, height: 800 },
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
]

const HERO_VIEWPORTS = [
  ...PHONES,
  // Either side of the `sm` breakpoint (640px), where the frame used to change shape.
  { name: '639x900', width: 639, height: 900 },
  { name: '640x900', width: 640, height: 900 },
  { name: '768x1024 (tablet)', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1280x900', width: 1280, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '812x375 (phone, landscape)', width: 812, height: 375 },
]

const hasHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

test.describe('hero banners show the whole picture at every width', () => {
  for (const viewport of HERO_VIEWPORTS) {
    test(`every slide at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('')
      const carousel = page.getByRole('region', { name: 'באנרים' })
      const total = await carousel.getByRole('button', { name: /^באנר \d+ מתוך \d+$/ }).count()
      expect(total).toBeGreaterThan(1)

      for (let index = 0; index < total; index += 1) {
        await carousel.getByRole('button', { name: `באנר ${index + 1} מתוך ${total}` }).click()
        const image = carousel.getByRole('img').first()
        await expect(image).toHaveJSProperty('complete', true)

        const shape = await image.evaluate((img: HTMLImageElement) => {
          const frame = img.closest('.overflow-hidden')!.getBoundingClientRect()
          const box = img.getBoundingClientRect()
          const fit = getComputedStyle(img).objectFit
          const natural = img.naturalWidth / img.naturalHeight
          const arrows = [...document.querySelectorAll('[aria-label="הקודם"], [aria-label="הבא"]')]
            .map((arrow) => arrow.getBoundingClientRect())
            .map((rect) => ({
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
            }))
          return {
            frameRatio: frame.width / frame.height,
            frame: { top: frame.top, bottom: frame.bottom, left: frame.left, right: frame.right },
            boxRatio: box.width / box.height,
            fit,
            natural,
            arrows,
          }
        })
        const where = `slide ${index + 1}: ${JSON.stringify(shape)}`

        // The frame has the banners' own shape, whatever the width (no jump at a breakpoint).
        expect(Math.abs(shape.frameRatio / BANNER_RATIO - 1), where).toBeLessThan(0.01)
        if (shape.fit === 'cover') {
          // Nothing is cut off: the picture has the shape of its frame.
          expect(Math.abs(shape.natural / shape.boxRatio - 1), where).toBeLessThan(0.01)
        } else {
          // A picture of another shape is shown whole on the banner's background instead.
          expect(shape.fit, where).toBe('contain')
        }
        // The arrows stay inside the frame.
        for (const arrow of shape.arrows) {
          expect(arrow.left, where).toBeGreaterThanOrEqual(shape.frame.left)
          expect(arrow.right, where).toBeLessThanOrEqual(shape.frame.right)
          expect(arrow.top, where).toBeGreaterThanOrEqual(shape.frame.top)
          expect(arrow.bottom, where).toBeLessThanOrEqual(shape.frame.bottom)
        }
      }
      expect(await hasHorizontalScroll(page), 'the page scrolls sideways').toBe(false)
    })
  }

  test('the arrows leave most of a phone banner uncovered', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('')
    const carousel = page.getByRole('region', { name: 'באנרים' })
    const frame = (await carousel.locator('.overflow-hidden').first().boundingBox())!
    const arrow = (await carousel.getByRole('button', { name: 'הבא' }).boundingBox())!

    // Both arrows together take under a quarter of the width and under a third of the height.
    expect((arrow.width * 2) / frame.width).toBeLessThan(0.25)
    expect(arrow.height / frame.height).toBeLessThan(0.33)
    // Still a comfortable touch target.
    expect(arrow.width).toBeGreaterThanOrEqual(36)
  })
})

test.describe('no page scrolls sideways on a phone', () => {
  for (const viewport of PHONES) {
    test(`pages at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      const product = productById('GZ790AORUSELITEXWIFI7')

      for (const path of ['', 'products', `products/${product.id}`, 'cart', 'login', 'register']) {
        await page.goto(path)
        await page.getByRole('main').waitFor()
        await page.waitForLoadState('networkidle')
        expect(await hasHorizontalScroll(page), `/${path} scrolls sideways`).toBe(false)
      }
    })
  }
})

test.describe('the header on a small screen', () => {
  for (const viewport of PHONES) {
    test(`keeps every control full size at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('')

      const controls = [
        header(page).getByRole('button', { name: 'פתיחת תפריט' }),
        header(page).getByRole('link', { name: 'מועדפים' }),
        header(page).getByRole('link', { name: 'עגלת קניות' }),
        header(page).getByRole('link', { name: 'התחברות' }),
      ]
      for (const control of controls) {
        const box = (await control.boundingBox())!
        // 44px: nothing is squeezed to make the row fit.
        expect(box.width, await control.innerText()).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      }
    })
  }

  test('offers the search shortcut from 360px, and the menu has the search box below that', async ({
    page,
  }) => {
    const shortcut = header(page).getByRole('button', { name: 'פתיחת חיפוש' })

    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('')
    await expect(shortcut).toBeHidden()
    await header(page).getByRole('button', { name: 'פתיחת תפריט' }).click()
    await expect(page.getByRole('dialog').getByRole('searchbox')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.setViewportSize({ width: 360, height: 800 })
    await expect(shortcut).toBeVisible()
    await shortcut.click()
    await expect(page.getByRole('dialog').getByRole('searchbox')).toBeFocused()
  })

  test('stays at the top of the page, except on a screen too short to spare the room', async ({
    page,
  }) => {
    const position = () => header(page).evaluate((element) => getComputedStyle(element).position)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('')
    expect(await position()).toBe('sticky')

    await page.setViewportSize({ width: 390, height: 844 })
    expect(await position()).toBe('sticky')

    // A phone on its side: the two-row header would cover almost a third of the screen.
    await page.setViewportSize({ width: 812, height: 375 })
    expect(await position()).toBe('static')
  })
})

test.describe('the header of a signed-in visitor on a desktop', () => {
  for (const width of [768, 1024, 1279, 1280, 1366, 1920]) {
    test(`fits, and leaves the search box usable, at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await register(page, newAccount())
      await expectSignedIn(page)

      expect(await hasHorizontalScroll(page), 'the page scrolls sideways').toBe(false)
      const everywhere = header(page).getByRole('button', { name: 'התנתקות מכל המכשירים' })
      // The extra button is for the wide header only (xl, 1280px): the menu has it everywhere.
      await (width >= 1280 ? expect(everywhere).toBeVisible() : expect(everywhere).toBeHidden())
      if (width >= 768) {
        const search = (await header(page).getByRole('searchbox').boundingBox())!
        expect(search.width, 'the search box was squeezed').toBeGreaterThanOrEqual(180)
        expect(search.x).toBeGreaterThanOrEqual(0)
        expect(search.x + search.width).toBeLessThanOrEqual(width)
      }
      // Every control of the header is inside the screen.
      for (const control of await header(page).getByRole('button').all()) {
        const box = await control.boundingBox()
        if (!box) continue
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
      }
    })
  }
})
