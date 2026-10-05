import { readFileSync } from 'node:fs'
import type { Product } from '../products/types.ts'

/** A valid product. The id is also its image folder, like in the real catalog. */
export function makeProduct(overrides: Partial<Product> = {}): Product {
  const id = overrides.id ?? 'GV-N4060'
  return {
    id,
    category: 'gpu',
    brand: 'gigabyte',
    name: `Gigabyte ${id}`,
    fullName: `Gigabyte graphics card ${id}`,
    price: { current: 1500 },
    images: { card: `images/products/${id}/card.webp`, gallery: [`images/products/${id}/1.webp`] },
    isRecommended: false,
    warranty: '3 שנים',
    manufacturerUrl: 'https://www.gigabyte.com/Graphics-Card',
    features: ['8GB GDDR6'],
    specs: [{ label: 'זיכרון', value: '8GB' }],
    ...overrides,
  }
}

/** The storefront's catalog as the seed reads it: the parsed JSON, not yet validated. */
export function readSourceCatalog(): unknown {
  const file = new URL('../../../public/data/products.json', import.meta.url)
  return JSON.parse(readFileSync(file, 'utf8'))
}
