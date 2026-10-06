import type { Page, Route } from '@playwright/test'
import { productById } from './support/catalog'
import {
  addToCartFromProductPage,
  expectSignedIn,
  header,
  newAccount,
  register,
} from './support/helpers'
import { expect, test } from './support/test'

/** A product with several gallery pictures, so the page has thumbnails. */
const WITH_THUMBNAILS = productById('GZ790AORUSELITEXWIFI7')

interface Measured {
  src: string
  inThumbnails: boolean
  width: string | null
  height: string | null
  naturalWidth: number
  naturalHeight: number
}

/**
 * Every lazy image on the page, loaded for real: the size attributes it declares and the size of
 * its file. Lazy images far down the page are not requested until the visitor gets near them, so
 * each one is switched to eager and decoded first.
 */
async function lazyImages(page: Page): Promise<Measured[]> {
  return page.evaluate(async () => {
    const lazy = [...document.images].filter((img) => img.loading === 'lazy')
    await Promise.all(
      lazy.map((img) => {
        img.loading = 'eager'
        return img.decode().catch(() => undefined)
      }),
    )
    return lazy.map((img) => ({
      src: img.getAttribute('src') ?? '',
      inThumbnails: img.closest('[aria-label="תמונות המוצר"]') !== null,
      width: img.getAttribute('width'),
      height: img.getAttribute('height'),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }))
  })
}

/** Every lazy image declares a size in the shape of its file, so its space is reserved. */
async function expectSized(page: Page) {
  const images = await lazyImages(page)
  expect(images.length, 'the page has lazy images to check').toBeGreaterThan(0)

  for (const image of images) {
    const where = `${image.src} (${image.width}x${image.height} declared, ${image.naturalWidth}x${image.naturalHeight} file)`
    expect(image.width, where).toMatch(/^[1-9]\d*$/)
    expect(image.height, where).toMatch(/^[1-9]\d*$/)
    expect(image.naturalWidth, `${where} did not load`).toBeGreaterThan(0)
    // A thumbnail is shown in a square box whatever the shape of its file (object-contain), so
    // only its presence matters. Everything else must declare the shape of its file.
    if (image.inThumbnails) continue
    const declared = Number(image.width) / Number(image.height)
    const actual = image.naturalWidth / image.naturalHeight
    expect(Math.abs(declared / actual - 1), where).toBeLessThan(0.01)
  }
}

test.describe('lazy images declare their size', () => {
  for (const viewport of [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'phone', width: 390, height: 844 },
  ]) {
    test(`home page: hero banners, categories, brands and product cards (${viewport.name})`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto('')
      await expect(page.getByRole('article').first()).toBeVisible()

      await expectSized(page)
    })
  }

  test('product listing and category pages: product cards and brand logos', async ({ page }) => {
    await page.goto('products')
    await expect(page.getByRole('article').first()).toBeVisible()
    await expectSized(page)

    await page.goto('category/cpu')
    await expect(page.getByRole('article').first()).toBeVisible()
    await expectSized(page)
  })

  test('product page: the thumbnails, and the brand logo above the name', async ({ page }) => {
    await page.goto(`products/${WITH_THUMBNAILS.id}`)
    await expect(page.getByRole('list', { name: 'תמונות המוצר' })).toBeVisible()
    await expectSized(page)

    // The brand logo here is not lazy, but it has the same shape and needs the same space.
    const logo = page.getByRole('main').getByRole('img', { name: 'Gigabyte', exact: true })
    await expect(logo).toHaveAttribute('width', '90')
    await expect(logo).toHaveAttribute('height', '40')
  })

  test('live search suggestions', async ({ page }) => {
    await page.goto('')
    await header(page).getByRole('searchbox', { name: 'חיפוש מוצרים' }).pressSequentially('intel')
    await expect(
      header(page).getByRole('listbox', { name: 'הצעות לחיפוש' }).getByRole('option').first(),
    ).toBeVisible()

    await expectSized(page)
  })

  test('cart and checkout: the product pictures of the order lines', async ({ page }) => {
    await register(page, newAccount())
    await expectSignedIn(page)
    await addToCartFromProductPage(page, productById('N4070GAMINGOCV212GD'))

    await page.goto('cart')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectSized(page)

    await page.goto('checkout')
    await expect(page.getByRole('list', { name: /.+/ }).first()).toBeVisible()
    await expectSized(page)
  })
})

test.describe('space is reserved before the pictures arrive', () => {
  test('brand logos and category images have their shape while no file has loaded yet', async ({
    page,
  }) => {
    // Hold every picture back, the way a slow connection does, so what is measured is the
    // layout the page has before any file arrives.
    const held: Route[] = []
    await page.route('**/images/**', (route) => {
      held.push(route)
    })

    try {
      await page.goto('', { waitUntil: 'commit' })
      const brands = page.getByRole('list').filter({ has: page.getByRole('img', { name: 'AMD' }) })
      await expect(brands.getByRole('img')).toHaveCount(7)

      const shapes = await page.evaluate(() =>
        [...document.querySelectorAll('img')]
          .filter((img) => img.loading === 'lazy' && img.complete === false)
          .map((img) => {
            const box = img.getBoundingClientRect()
            return {
              src: img.getAttribute('src') ?? '',
              width: box.width,
              height: box.height,
            }
          }),
      )
      const logos = shapes.filter((shape) => shape.src.includes('/brands/'))
      const categories = shapes.filter((shape) => shape.src.includes('/categories/'))
      expect(logos.length).toBeGreaterThanOrEqual(7)
      expect(categories.length).toBe(6)

      for (const logo of logos) {
        expect(logo.height, logo.src).toBeGreaterThan(0)
        // 90x40, whatever the height the CSS gives it (40px in the strip, 20px on a card).
        expect(logo.width / logo.height, logo.src).toBeCloseTo(90 / 40, 1)
      }
      for (const category of categories) {
        expect(category.height, category.src).toBeGreaterThan(0)
        expect(category.width, category.src).toBeGreaterThan(0)
      }
    } finally {
      await Promise.all(held.map((route) => route.continue()))
    }
  })
})
