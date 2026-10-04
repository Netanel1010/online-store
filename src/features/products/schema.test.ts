import catalog from '../../../public/data/products.json'
import { makeProduct } from '@/test/fixtures'
import { productSchema, productsSchema } from './schema'

// Every file under public/images, keyed by its path relative to public/.
const imageFiles = new Set(
  Object.keys(import.meta.glob('../../../public/images/**/*.{webp,avif}')).map((path) =>
    path.replace('../../../public/', ''),
  ),
)

describe('real product catalog (public/data/products.json)', () => {
  const parsed = productsSchema.safeParse(catalog)

  it('passes schema validation', () => {
    if (!parsed.success) throw new Error(parsed.error.message)
    expect(parsed.data.length).toBeGreaterThan(0)
  })

  it('does not contain the removed joke item', () => {
    expect(JSON.stringify(catalog)).not.toContain('"banana"')
  })

  it('only marks a product as on sale when the old price is higher', () => {
    if (!parsed.success) throw new Error(parsed.error.message)
    for (const { id, price } of parsed.data) {
      if (price.original !== undefined) {
        expect(price.original, id).toBeGreaterThan(price.current)
      }
    }
  })

  it('has the two corrected products without a sale price', () => {
    if (!parsed.success) throw new Error(parsed.error.message)
    for (const id of ['N406TGAMINGOC8GD', 'M27Q']) {
      const product = parsed.data.find((p) => p.id === id)
      expect(product, id).toBeDefined()
      expect(product?.price.original, id).toBeUndefined()
    }
  })

  it('references only image files that exist', () => {
    if (!parsed.success) throw new Error(parsed.error.message)
    expect(imageFiles.size).toBeGreaterThan(100) // guards against a glob that matches nothing
    const missing = parsed.data.flatMap((p) =>
      [p.images.card, ...p.images.gallery].filter((path) => !imageFiles.has(path)),
    )
    expect(missing).toEqual([])
  })
})

describe('productSchema', () => {
  it('accepts a valid product', () => {
    expect(productSchema.safeParse(makeProduct()).success).toBe(true)
  })

  it('rejects an original price that is not higher than the current price', () => {
    const result = productSchema.safeParse(makeProduct({ price: { current: 1000, original: 900 } }))
    expect(result.success).toBe(false)
  })

  it('rejects an unknown category', () => {
    const result = productSchema.safeParse({ ...makeProduct(), category: 'laptop' })
    expect(result.success).toBe(false)
  })

  it('rejects a non-http manufacturer URL', () => {
    const result = productSchema.safeParse(makeProduct({ manufacturerUrl: 'javascript:alert(1)' }))
    expect(result.success).toBe(false)
  })

  it('rejects a product without gallery images', () => {
    const result = productSchema.safeParse(
      makeProduct({ images: { card: 'images/x.webp', gallery: [] } }),
    )
    expect(result.success).toBe(false)
  })
})

describe('productsSchema', () => {
  it('rejects duplicate product ids', () => {
    const result = productsSchema.safeParse([makeProduct(), makeProduct()])
    expect(result.success).toBe(false)
  })
})
