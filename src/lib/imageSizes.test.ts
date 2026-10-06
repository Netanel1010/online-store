import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HERO_SLIDES } from '@/features/home/heroSlides'
import { BRAND_IDS, BRANDS } from '@/features/products/brands'
import { CATEGORIES } from '@/features/products/categories'
import { IMAGE_SIZE } from './imageSizes'

/** The size of an image file in `public/`, read from its header (WebP and AVIF only). */
function fileSize(path: string): { width: number; height: number } {
  const file = readFileSync(resolve(process.cwd(), 'public', path))
  if (path.endsWith('.avif')) {
    // The "ispe" (image spatial extents) box: version/flags, then width and height.
    const at = file.indexOf('ispe')
    return { width: file.readUInt32BE(at + 8), height: file.readUInt32BE(at + 12) }
  }
  const format = file.toString('ascii', 12, 16)
  if (format === 'VP8 ') {
    return { width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff }
  }
  if (format === 'VP8L') {
    const bits = file.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  return { width: 1 + file.readUIntLE(24, 3), height: 1 + file.readUIntLE(27, 3) }
}

const ratio = ({ width, height }: { width: number; height: number }) => width / height

describe('image sizes used to reserve space for lazy images', () => {
  it('reads the size of a file correctly (the reader is checked against known files)', () => {
    expect(fileSize('images/brands/amd.webp')).toEqual({ width: 90, height: 40 })
    expect(fileSize('images/hero/slide-1.avif')).toEqual({ width: 1154, height: 368 })
  })

  it('gives every brand logo the size of its file', () => {
    for (const id of BRAND_IDS) {
      expect(fileSize(BRANDS[id].logo), BRANDS[id].logo).toEqual(IMAGE_SIZE.brandLogo)
    }
  })

  it('gives every category image the size of its file', () => {
    const images = CATEGORIES.flatMap((category) => (category.image ? [category.image] : []))
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) {
      expect(fileSize(image), image).toEqual(IMAGE_SIZE.category)
    }
  })

  it('gives every hero slide the size of its file', () => {
    for (const slide of HERO_SLIDES) {
      expect({ width: slide.width, height: slide.height }, slide.image).toEqual(
        fileSize(slide.image),
      )
    }
  })

  it('is square for the products, whose card images are all square', () => {
    const products: { images: { card: string } }[] = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/data/products.json'), 'utf8'),
    )
    expect(products.length).toBeGreaterThan(0)
    expect(ratio(IMAGE_SIZE.productPicture)).toBe(1)
    for (const { images } of products) {
      expect(ratio(fileSize(images.card)), images.card).toBe(1)
    }
  })
})
