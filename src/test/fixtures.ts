import type { Product } from '@/features/products/schema'

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'TEST-SKU-1',
    category: 'gpu',
    brand: 'gigabyte',
    name: 'Gigabyte RTX Test Card',
    fullName: 'Gigabyte RTX Test Card 8GB',
    price: { current: 1000 },
    images: {
      card: 'images/products/test/card.webp',
      gallery: ['images/products/test/1.webp', 'images/products/test/2.webp'],
    },
    isRecommended: false,
    warranty: '3 שנים',
    manufacturerUrl: 'https://example.com/product',
    features: ['8GB GDDR6'],
    specs: [{ label: 'זיכרון', value: '8GB' }],
    ...overrides,
  }
}
