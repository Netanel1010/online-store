import catalog from '../../../../public/data/products.json'
import { makeProduct } from '@/test/fixtures'
import { BRANDS } from '../brands'
import { productsSchema, type Product } from '../schema'
import {
  matchesSearch,
  normalizeSearchText,
  rankBySearch,
  searchMatches,
  searchScore,
  searchWords,
} from './search'

// The real catalog: the cases below are the ones a shopper would actually type.
const products = productsSchema.parse(catalog)

const find = (query: string) => {
  const found = searchMatches(products, query)
  return rankBySearch(found === null ? products : products.filter((p) => found.has(p)), query)
}
const idsFor = (query: string) => find(query).map((product) => product.id)

const RTX_4070 = 'N4070GAMINGOCV212GD'
const RYZEN_7800X3D = '100-000000910'

describe('normalizeSearchText', () => {
  it('ignores case, extra spaces and punctuation', () => {
    expect(normalizeSearchText('  GV-N4070GAMING  ')).toBe('gv n4070gaming')
    expect(normalizeSearchText('WD_BLACK (SN8100) / NVMe')).toBe('wd black sn8100 nvme')
    expect(normalizeSearchText('Intel®  Core™ i7')).toBe('intel core i7')
  })

  it('drops accents, niqqud and quote marks', () => {
    expect(normalizeSearchText('Ryzén')).toBe('ryzen')
    expect(normalizeSearchText('מְעַבְּדִים')).toBe('מעבדים')
    expect(normalizeSearchText('מק"ט')).toBe('מקט')
    expect(normalizeSearchText("don't")).toBe('dont')
  })
})

describe('searchWords', () => {
  it('splits, normalizes and removes repeats', () => {
    expect(searchWords('RTX-4070  rtx  4070')).toEqual(['rtx', '4070'])
  })

  it('is empty for blank or punctuation-only queries', () => {
    expect(searchWords('')).toEqual([])
    expect(searchWords('  - / ')).toEqual([])
  })

  it('keeps at most eight words', () => {
    expect(searchWords('a b c d e f g h i j k')).toHaveLength(8)
  })
})

describe('searching the real catalog', () => {
  it('finds the RTX 4070 by its number', () => {
    expect(idsFor('4070')).toEqual([RTX_4070])
  })

  it('finds the same product for "RTX 4070", in any case and spacing', () => {
    for (const query of [
      'RTX 4070',
      'rtx 4070',
      'Rtx   4070',
      ' rtx 4070 ',
      'rtx-4070',
      'rtx4070',
    ]) {
      expect(idsFor(query), query).toEqual([RTX_4070])
    }
  })

  it('finds it when the title does not contain every word (GeForce, NVIDIA)', () => {
    expect(idsFor('GeForce RTX 4070')).toEqual([RTX_4070])
    expect(idsFor('nvidia 4070')).toEqual([RTX_4070])
  })

  it('does not mix up neighbouring models', () => {
    expect(idsFor('4070')).not.toContain('N5070WF3OC12GD')
    expect(idsFor('5070')).toEqual(
      expect.arrayContaining(['N5070WF3OC12GD', 'N507TEAGLEOCICE16GD']),
    )
    expect(idsFor('5070')).not.toContain(RTX_4070)
  })

  it('finds model numbers by a part of them', () => {
    expect(idsFor('7800X3D')).toEqual([RYZEN_7800X3D])
    expect(idsFor('7800')).toEqual([RYZEN_7800X3D])
    expect(idsFor('x3d')).toEqual([RYZEN_7800X3D])
    expect(idsFor('7800 x3d')).toEqual([RYZEN_7800X3D])
    expect(idsFor('7800-x3d')).toEqual([RYZEN_7800X3D])
    expect(idsFor('ryzen 7 7800x3d')).toEqual([RYZEN_7800X3D])
  })

  it('finds products by their SKU, with or without separators', () => {
    expect(idsFor('GV-N4070GAMING')).toEqual([RTX_4070])
    expect(idsFor('gv n4070 gaming')).toEqual([RTX_4070])
    expect(idsFor('GP-P650G')).toEqual(['GP-P650G'])
    expect(idsFor('gpp650g')).toEqual(['GP-P650G'])
  })

  it('finds products by brand, and only that brand', () => {
    expect(idsFor('asus')).toEqual(['90MB1CX0-M1EAY0'])
    for (const brand of ['intel', 'amd', 'corsair', 'gigabyte'] as const) {
      const expected = products.filter((p) => p.brand === brand).map((p) => p.id)
      expect(idsFor(BRANDS[brand].name).sort(), brand).toEqual(expected.sort())
      expect(idsFor(BRANDS[brand].name.toUpperCase()).sort(), brand).toEqual(expected.sort())
    }
  })

  it('finds products by category, in Hebrew and with the English name', () => {
    const gpus = products.filter((p) => p.category === 'gpu').map((p) => p.id)
    expect(idsFor('כרטיסי מסך').sort()).toEqual(gpus.sort())
    expect(idsFor('gpu').sort()).toEqual(gpus.sort())
  })

  it('combines words: brand and model narrow the result together', () => {
    expect(idsFor('gigabyte 4070')).toEqual([RTX_4070])
    expect(idsFor('intel 4070')).toEqual([])
    expect(idsFor('asus 4070')).toEqual([])
  })

  it('does not match a short word in the middle of another word', () => {
    // "i7" must not find "WIFI7" (a Wi-Fi 7 board); the catalog has no Core i7.
    expect(idsFor('i7')).toEqual([])
  })

  it('looks at specification values only when the core fields find nothing', () => {
    const ddr5 = idsFor('ddr5')
    expect(ddr5.length).toBeGreaterThan(0)
    expect(ddr5).toContain('C285T') // an Intel CPU that supports DDR5
    expect(ddr5).not.toContain(RTX_4070)
  })

  it('finds nothing for words that are not in the catalog', () => {
    expect(idsFor('banana')).toEqual([])
    expect(idsFor('rtx 9999')).toEqual([])
    expect(idsFor('SN8100')).toEqual([]) // no such product in the catalog
  })

  it('treats a blank query as "no search"', () => {
    expect(searchMatches(products, '')).toBeNull()
    expect(searchMatches(products, '   -  ')).toBeNull()
  })
})

describe('searching a model number that is written in different ways', () => {
  const ssd = makeProduct({
    id: 'WDS100T1X0E',
    name: 'WD_BLACK SN8100 NVMe SSD 1TB',
    fullName: 'Western Digital WD_BLACK SN8100 NVMe M.2 SSD 1TB',
    brand: 'samsung',
    category: 'storage',
  })
  const wifi = makeProduct({ id: 'W7', name: 'ASUS PRIME B760M WiFi7', category: 'motherboard' })
  const i7 = makeProduct({ id: 'I7-13700K', name: 'Intel Core i7-13700K', category: 'cpu' })
  const catalogWith = [ssd, wifi, i7]

  const found = (query: string) =>
    catalogWith.filter((p) => matchesSearch(p, query)).map((p) => p.id)

  it('matches SN8100 however it is typed', () => {
    for (const query of ['SN8100', 'sn8100', 'SN-8100', 'sn 8100', 'wd black sn8100', 'wd_black']) {
      expect(found(query), query).toEqual(['WDS100T1X0E'])
    }
  })

  it('matches i7 at the start of a word, not inside WiFi7', () => {
    expect(found('i7')).toEqual(['I7-13700K'])
    expect(found('i7 13700')).toEqual(['I7-13700K'])
    expect(found('13700k')).toEqual(['I7-13700K'])
  })
})

describe('ranking', () => {
  const inName = makeProduct({ id: 'B', name: 'Gigabyte RTX 4070 Gaming' })
  const inSku = makeProduct({ id: 'X-4070-1', name: 'Graphics Card' })
  const phrase = makeProduct({ id: 'C', name: 'Card with RTX and also 4070' })

  it('puts a name match before a SKU match, whatever the catalog order', () => {
    expect(rankBySearch([inSku, inName], '4070').map((p) => p.id)).toEqual(['B', 'X-4070-1'])
  })

  it('puts words that appear together before words that are apart', () => {
    expect(rankBySearch([phrase, inName], 'rtx 4070').map((p) => p.id)).toEqual(['B', 'C'])
  })

  it('keeps the catalog order for equal scores', () => {
    const a = makeProduct({ id: 'A', name: 'Same name' })
    const b = makeProduct({ id: 'B2', name: 'Same name' })
    expect(rankBySearch([a, b], 'same').map((p) => p.id)).toEqual(['A', 'B2'])
    expect(rankBySearch([b, a], 'same').map((p) => p.id)).toEqual(['B2', 'A'])
  })

  it('scores a non-match as 0 and a blank query as a match', () => {
    expect(searchScore(inName, 'banana')).toBe(0)
    expect(searchScore(inName, '')).toBeGreaterThan(0)
  })
})

describe('products a search must not change', () => {
  it('leaves the product objects untouched and is repeatable', () => {
    const before = JSON.stringify(products)
    const first = idsFor('rtx 4070')
    const second = idsFor('rtx 4070')

    expect(second).toEqual(first)
    expect(JSON.stringify(products)).toBe(before)
  })

  it('has a search document for every product (no product breaks the search)', () => {
    const all: Product[] = [...products]
    expect(() =>
      all.forEach((product) => searchScore(product, 'test', { deep: true })),
    ).not.toThrow()
  })
})
