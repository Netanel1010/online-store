import { describe, expect, it } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
import { parseProductListQuery } from './listQuery.ts'

const failure = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return error
  }
}

const invalid = (query: unknown) => failure(() => parseProductListQuery(query))

describe('parseProductListQuery: defaults', () => {
  it('is a plain listing when nothing is asked for', () => {
    expect(parseProductListQuery({})).toEqual({
      q: '',
      category: undefined,
      brands: [],
      specs: new Map(),
      sort: 'default',
      facets: false,
      ids: [],
      sale: false,
      recommended: false,
    })
  })

  it('keeps page and limit, which the service validates', () => {
    expect(parseProductListQuery({ page: '2', limit: '10' })).toMatchObject({ page: 2, limit: 10 })
  })

  it('ignores parameters it does not know', () => {
    expect(parseProductListQuery({ utm_source: 'x', foo: ['a', 'b'] })).toMatchObject({
      q: '',
      brands: [],
    })
  })
})

describe('parseProductListQuery: search text', () => {
  it('trims the text', () => {
    expect(parseProductListQuery({ q: '  rtx 4070 ' }).q).toBe('rtx 4070')
  })

  it('treats a blank text as no search', () => {
    expect(parseProductListQuery({ q: '   ' }).q).toBe('')
    expect(parseProductListQuery({ q: '' }).q).toBe('')
  })

  it('accepts Hebrew and punctuation', () => {
    expect(parseProductListQuery({ q: 'מק"ט GV-N4070' }).q).toBe('מק"ט GV-N4070')
  })

  it('accepts exactly 100 characters and rejects 101', () => {
    expect(parseProductListQuery({ q: 'a'.repeat(100) }).q).toHaveLength(100)
    expect(invalid({ q: 'a'.repeat(101) })).toMatchObject({ status: 400, code: 'invalid_query' })
  })

  it('rejects a repeated q', () => {
    expect(invalid({ q: ['a', 'b'] })).toMatchObject({ status: 400, code: 'invalid_query' })
  })

  it('rejects a q that is not text', () => {
    expect(invalid({ q: { $ne: '' } })).toMatchObject({ status: 400, code: 'invalid_query' })
  })
})

describe('parseProductListQuery: category', () => {
  it('accepts a known category', () => {
    expect(parseProductListQuery({ category: 'cpu' }).category).toBe('cpu')
  })

  it.each(['CPU', 'phones', '', ['cpu', 'gpu'], { $ne: 'cpu' }])(
    'rejects the category %j',
    (category) => {
      expect(invalid({ category })).toMatchObject({ status: 400, code: 'invalid_query' })
    },
  )
})

describe('parseProductListQuery: brand', () => {
  it('accepts one brand', () => {
    expect(parseProductListQuery({ brand: 'amd' }).brands).toEqual(['amd'])
  })

  it('accepts several, in the order of the brand registry and without repeats', () => {
    expect(parseProductListQuery({ brand: ['intel', 'amd', 'intel'] }).brands).toEqual([
      'amd',
      'intel',
    ])
  })

  it.each(['nvidia', '', 'AMD', ['amd', 'nope']])('rejects the brand %j', (brand) => {
    expect(invalid({ brand })).toMatchObject({ status: 400, code: 'invalid_query' })
  })
})

describe('parseProductListQuery: specification filters', () => {
  it('reads s.<label> parameters, one value or several', () => {
    const { specs } = parseProductListQuery({
      's.תושבת מעבד': ['AM5', 'LGA 1700'],
      's.תמיכה בזכרון': 'DDR5',
    })

    expect([...specs]).toEqual([
      ['תושבת מעבד', ['AM5', 'LGA 1700']],
      ['תמיכה בזכרון', ['DDR5']],
    ])
  })

  it('drops repeated values of a label', () => {
    expect(parseProductListQuery({ 's.x': ['a', 'b', 'a'] }).specs.get('x')).toEqual(['a', 'b'])
  })

  it('keeps a label such as __proto__ as plain data', () => {
    const { specs } = parseProductListQuery({ 's.__proto__': 'x' })

    expect(specs.get('__proto__')).toEqual(['x'])
    expect(Object.prototype).not.toHaveProperty('x')
  })

  it('does not read other parameters as specification filters', () => {
    expect(parseProductListQuery({ s: 'x', specs: 'y', 'brand.s.x': 'z' }).specs.size).toBe(0)
  })

  it.each([
    ['an empty label', { 's.': 'x' }],
    ['an empty value', { 's.x': '' }],
    ['an empty value among others', { 's.x': ['a', ''] }],
    ['a value that is not text', { 's.x': { $ne: '' } }],
    ['a label of 101 characters', { [`s.${'a'.repeat(101)}`]: 'x' }],
    ['a value of 101 characters', { 's.x': 'a'.repeat(101) }],
  ])('rejects %s', (_name, query) => {
    expect(invalid(query)).toMatchObject({ status: 400, code: 'invalid_query' })
  })

  it('accepts 60 values in all and rejects 61', () => {
    const values = (count: number) => Array.from({ length: count }, (_, index) => `v${index}`)

    expect(parseProductListQuery({ 's.x': values(60) }).specs.get('x')).toHaveLength(60)
    expect(invalid({ 's.x': values(61) })).toMatchObject({ status: 400, code: 'invalid_query' })
    expect(invalid({ 's.x': values(30), 's.y': values(31) })).toMatchObject({
      status: 400,
      code: 'invalid_query',
    })
  })
})

describe('parseProductListQuery: sort', () => {
  it.each(['default', 'price-asc', 'price-desc', 'name-asc', 'name-desc'])(
    'accepts the sort "%s"',
    (sort) => {
      expect(parseProductListQuery({ sort }).sort).toBe(sort)
    },
  )

  it.each(['price', 'PRICE-ASC', '', ['price-asc', 'price-desc'], 'price-asc; drop'])(
    'rejects the sort %j',
    (sort) => {
      expect(invalid({ sort })).toMatchObject({ status: 400, code: 'invalid_query' })
    },
  )
})

describe('parseProductListQuery: facets', () => {
  it('is true or false, and false by default', () => {
    expect(parseProductListQuery({ facets: 'true' }).facets).toBe(true)
    expect(parseProductListQuery({ facets: 'false' }).facets).toBe(false)
    expect(parseProductListQuery({}).facets).toBe(false)
  })

  it.each(['1', 'yes', 'TRUE', '', ['true', 'false']])('rejects facets=%j', (facets) => {
    expect(invalid({ facets })).toMatchObject({ status: 400, code: 'invalid_query' })
  })
})

describe('parseProductListQuery: ids', () => {
  it('reads a comma-separated list, without repeats and in the order given', () => {
    expect(parseProductListQuery({ ids: 'B-2,A-1,B-2' }).ids).toEqual(['B-2', 'A-1'])
  })

  it('reads a repeated parameter as well', () => {
    expect(parseProductListQuery({ ids: ['A-1,B-2', 'C-3'] }).ids).toEqual(['A-1', 'B-2', 'C-3'])
  })

  it('accepts 100 ids and rejects 101', () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => `P-${i}`).join(',')

    expect(parseProductListQuery({ ids: many(100) }).ids).toHaveLength(100)
    expect(invalid({ ids: many(101) })).toMatchObject({ status: 400, code: 'invalid_query' })
  })

  it.each(['', ',', 'A-1,,B-2', 'A 1', 'A-1;B-2', "A-1'", '$ne', '.A', 'x'.repeat(65)])(
    'rejects ids=%j',
    (ids) => {
      expect(invalid({ ids })).toMatchObject({ status: 400, code: 'invalid_query' })
    },
  )

  it('is not the same as no ids: an empty list is refused rather than read as the whole catalog', () => {
    expect(parseProductListQuery({}).ids).toEqual([])
    expect(invalid({ ids: '' })).toBeInstanceOf(HttpError)
  })
})

describe('parseProductListQuery: sale and recommended', () => {
  it('are true or false, and false by default', () => {
    expect(parseProductListQuery({ sale: 'true' }).sale).toBe(true)
    expect(parseProductListQuery({ sale: 'false' }).sale).toBe(false)
    expect(parseProductListQuery({ recommended: 'true' }).recommended).toBe(true)
    expect(parseProductListQuery({}).recommended).toBe(false)
  })

  it.each(['sale', 'recommended'])('rejects anything else for %s', (name) => {
    for (const value of ['1', 'yes', 'TRUE', '', ['true', 'false']]) {
      expect(invalid({ [name]: value })).toMatchObject({ status: 400, code: 'invalid_query' })
    }
  })
})

describe('parseProductListQuery: errors', () => {
  it('answers with the usual error type and a message that does not repeat the input', () => {
    const error = invalid({ sort: 'secret-value' })

    expect(error).toBeInstanceOf(HttpError)
    expect((error as Error).message).toContain('sort')
    expect((error as Error).message).not.toContain('secret-value')
  })

  it('reports a page or limit that is not a number as before, with its own code', () => {
    expect(invalid({ page: 'x' })).toMatchObject({ status: 400, code: 'invalid_pagination' })
    expect(invalid({ limit: '1.5', sort: 'nope' })).toMatchObject({ code: 'invalid_pagination' })
  })
})
