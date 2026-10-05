import {
  ariaCurrent,
  categoryOfPath,
  mainLinkState,
  mainLinks,
  productIdOfPath,
} from './navigation'

const [home, products] = mainLinks as [(typeof mainLinks)[number], (typeof mainLinks)[number]]

describe('mainLinkState', () => {
  it('marks home only on the home page', () => {
    expect(mainLinkState(home, '/')).toBe('page')
    expect(mainLinkState(home, '/products')).toBeNull()
    expect(mainLinkState(home, '/cart')).toBeNull()
  })

  it('marks products as the page, and as the section for category and product pages', () => {
    expect(mainLinkState(products, '/products')).toBe('page')
    expect(mainLinkState(products, '/products/')).toBe('page')
    expect(mainLinkState(products, '/products/GP-P650G')).toBe('section')
    expect(mainLinkState(products, '/category/gpu')).toBe('section')
  })

  it('does not mark products for other pages, or for a path that only starts like it', () => {
    expect(mainLinkState(products, '/cart')).toBeNull()
    expect(mainLinkState(products, '/search')).toBeNull()
    expect(mainLinkState(products, '/productsX')).toBeNull()
    expect(mainLinkState(products, '/')).toBeNull()
  })
})

describe('path helpers', () => {
  it('reads the category of a category page, with or without a closing slash', () => {
    expect(categoryOfPath('/category/gpu')).toEqual({ id: 'gpu', exact: true })
    expect(categoryOfPath('/category/gpu/')).toEqual({ id: 'gpu', exact: true })
    expect(categoryOfPath('/category/gpu/extra')).toBeNull()
    expect(categoryOfPath('/products/gpu')).toBeNull()
  })

  it('reads the product id of a product page and decodes it', () => {
    expect(productIdOfPath('/products/GP-P650G')).toBe('GP-P650G')
    expect(productIdOfPath('/products/GP-P650G/')).toBe('GP-P650G')
    expect(productIdOfPath('/products/a%20b')).toBe('a b')
    expect(productIdOfPath('/products')).toBeNull()
    expect(productIdOfPath('/category/gpu')).toBeNull()
  })

  it('turns a state into the aria-current value', () => {
    expect(ariaCurrent('page')).toBe('page')
    expect(ariaCurrent('section')).toBe('true')
    expect(ariaCurrent(null)).toBeUndefined()
  })
})
