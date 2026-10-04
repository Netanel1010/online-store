export const BRAND_IDS = [
  'amd',
  'intel',
  'corsair',
  'cooler-master',
  'asus',
  'gigabyte',
  'samsung',
] as const

export type BrandId = (typeof BRAND_IDS)[number]

export interface Brand {
  id: BrandId
  name: string
  /** Path relative to `public/`. */
  logo: string
}

export const BRANDS: Readonly<Record<BrandId, Brand>> = {
  amd: { id: 'amd', name: 'AMD', logo: 'images/brands/amd.webp' },
  intel: { id: 'intel', name: 'Intel', logo: 'images/brands/intel.webp' },
  corsair: { id: 'corsair', name: 'Corsair', logo: 'images/brands/corsair.webp' },
  'cooler-master': {
    id: 'cooler-master',
    name: 'Cooler Master',
    logo: 'images/brands/cooler-master.webp',
  },
  asus: { id: 'asus', name: 'ASUS', logo: 'images/brands/asus.webp' },
  gigabyte: { id: 'gigabyte', name: 'Gigabyte', logo: 'images/brands/gigabyte.webp' },
  samsung: { id: 'samsung', name: 'Samsung', logo: 'images/brands/samsung.webp' },
}
