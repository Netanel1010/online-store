import { readFileSync } from 'node:fs'

/**
 * The tests read the same static catalog the app serves (public/data/products.json), so their
 * expectations come from the data instead of hard-coded numbers, and there are no external
 * services or mocks involved.
 */
export interface CatalogProduct {
  id: string
  name: string
  fullName: string
  category: string
  brand: string
  price: { current: number; original?: number; eilat?: number }
  warranty: string
  images: { card: string; gallery: string[] }
  specs: { label: string; value: string }[]
}

export const catalog: CatalogProduct[] = JSON.parse(
  readFileSync(new URL('../../public/data/products.json', import.meta.url), 'utf8'),
)

export function productById(id: string): CatalogProduct {
  const found = catalog.find((product) => product.id === id)
  if (!found) throw new Error(`Test data: product ${id} is not in the catalog`)
  return found
}

export function specValue(product: CatalogProduct, label: string): string | undefined {
  return product.specs.find((spec) => spec.label === label)?.value
}

/** Display names used by the UI. */
export const BRAND_NAMES: Record<string, string> = {
  amd: 'AMD',
  intel: 'Intel',
  corsair: 'Corsair',
  'cooler-master': 'Cooler Master',
  asus: 'ASUS',
  gigabyte: 'Gigabyte',
  samsung: 'Samsung',
}

export const CATEGORY_LABELS: Record<string, string> = {
  cpu: 'מעבדים',
  gpu: 'כרטיסי מסך',
  case: 'מארזים',
  psu: 'ספקי כוח',
  monitor: 'מסכי מחשב',
}

/** A known set of products, chosen to exercise specific behaviour. */
export const PSU = productById('GP-P650G') // no sale price
export const SALE_GPU = productById('N4070GAMINGOCV212GD') // on sale (has an original price)
export const RAM = productById('CMG32GX4M2E3200C16')

export const SOCKET_LABEL = 'תושבת מעבד'
