import { discountPercent } from './selectors'

describe('selectors', () => {
  it('computes the discount percentage', () => {
    expect(discountPercent({ current: 750, original: 1000 })).toBe(25)
    expect(discountPercent({ current: 750 })).toBeUndefined()
  })
})
