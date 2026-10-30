import { BRAND_IDS } from './brands'
import { brandListingPath } from './brandPath'
import { parseListingState } from './listing/query'

describe('brandListingPath', () => {
  it('is the listing URL with that one brand checked', () => {
    expect(brandListingPath('asus')).toBe('/products?brand=asus')
    expect(brandListingPath('cooler-master')).toBe('/products?brand=cooler-master')
  })

  it.each(BRAND_IDS)('is read back by the listing page as only %s', (id) => {
    const [path, search] = brandListingPath(id).split('?')

    expect(path).toBe('/products')
    expect(parseListingState(new URLSearchParams(search)).brands).toEqual([id])
  })
})
