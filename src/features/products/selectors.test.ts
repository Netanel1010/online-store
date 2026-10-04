import { makeProduct } from '@/test/fixtures'
import {
  countByCategory,
  discountPercent,
  findProduct,
  productsInCategory,
  recommendedProducts,
  saleProducts,
} from './selectors'

const gpu = makeProduct({ id: 'GPU-1', category: 'gpu', isRecommended: true })
const cpu = makeProduct({
  id: 'CPU-1',
  category: 'cpu',
  price: { current: 750, original: 1000 },
})
const cpu2 = makeProduct({ id: 'CPU-2', category: 'cpu' })
const products = [gpu, cpu, cpu2]

describe('selectors', () => {
  it('finds a product by id and returns undefined for unknown or missing ids', () => {
    expect(findProduct(products, 'CPU-1')).toBe(cpu)
    expect(findProduct(products, 'nope')).toBeUndefined()
    expect(findProduct(products, undefined)).toBeUndefined()
  })

  it('filters by category', () => {
    expect(productsInCategory(products, 'cpu')).toEqual([cpu, cpu2])
    expect(productsInCategory(products, 'psu')).toEqual([])
  })

  it('selects recommended and sale products', () => {
    expect(recommendedProducts(products)).toEqual([gpu])
    expect(saleProducts(products)).toEqual([cpu])
  })

  it('counts products per category', () => {
    const counts = countByCategory(products)
    expect(counts.get('cpu')).toBe(2)
    expect(counts.get('gpu')).toBe(1)
    expect(counts.get('psu')).toBeUndefined()
  })

  it('computes the discount percentage', () => {
    expect(discountPercent({ current: 750, original: 1000 })).toBe(25)
    expect(discountPercent({ current: 750 })).toBeUndefined()
  })
})
