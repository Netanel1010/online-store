import { makeProduct } from '@/test/fixtures'
import { buildCartLines, summarizeCart } from './summary'

const a = makeProduct({ id: 'A', price: { current: 1000 } })
const b = makeProduct({ id: 'B', price: { current: 750, original: 1000 } })

describe('buildCartLines', () => {
  it('joins ids with the catalog and keeps the cart order', () => {
    const lines = buildCartLines(
      [
        { productId: 'B', quantity: 1 },
        { productId: 'A', quantity: 2 },
      ],
      [a, b],
    )

    expect(lines).toEqual([
      { product: b, quantity: 1 },
      { product: a, quantity: 2 },
    ])
  })

  it('skips products that are not in the catalog', () => {
    const lines = buildCartLines(
      [
        { productId: 'GONE', quantity: 1 },
        { productId: 'A', quantity: 1 },
      ],
      [a],
    )

    expect(lines).toEqual([{ product: a, quantity: 1 }])
  })
})

describe('summarizeCart', () => {
  it('is all zeros for an empty cart', () => {
    expect(summarizeCart([])).toEqual({ itemCount: 0, originalTotal: 0, total: 0, savings: 0 })
  })

  it('totals current prices by quantity', () => {
    const summary = summarizeCart([
      { product: a, quantity: 2 },
      { product: makeProduct({ id: 'C', price: { current: 70 } }), quantity: 3 },
    ])

    expect(summary).toMatchObject({ itemCount: 5, total: 2210, savings: 0, originalTotal: 2210 })
  })

  it('reports savings from products that are on sale', () => {
    const summary = summarizeCart([
      { product: a, quantity: 1 },
      { product: b, quantity: 2 },
    ])

    expect(summary).toEqual({ itemCount: 3, total: 2500, originalTotal: 3000, savings: 500 })
  })
})
