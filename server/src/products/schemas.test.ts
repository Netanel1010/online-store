import { describe, expect, it } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
import { readSourceCatalog } from '../testing/products.ts'
import { catalogSchema, parsePaginationQuery, parseProductId, productIdSchema } from './schemas.ts'

const failure = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return error
  }
}

describe('parseProductId', () => {
  it.each(['N406TGAMINGOC8GD', 'CC-9011240-WW', '100-000000910', 'a.b_c-d', 'X'])(
    'accepts the id "%s"',
    (id) => {
      expect(parseProductId(id)).toBe(id)
    },
  )

  it('accepts every id in the real catalog', () => {
    for (const product of readSourceCatalog() as { id: string }[]) {
      expect(productIdSchema.safeParse(product.id).success, product.id).toBe(true)
    }
  })

  it.each([
    '',
    ' ',
    'has space',
    '../etc/passwd',
    'a/b',
    '-leading-dash',
    '.hidden',
    'semi;colon',
    '{"$ne":""}',
    '$where',
    'x'.repeat(65),
    'עברית',
    'a\u0000b',
  ])('rejects the id %j with a 400 that does not repeat it', (id) => {
    const error = failure(() => parseProductId(id))

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 400, code: 'invalid_product_id' })
    expect((error as Error).message).not.toContain(id.trim() || '\u0001')
  })

  it.each([undefined, null, 5, ['a'], { $ne: '' }])(
    'rejects the value %j that is not text',
    (id) => {
      expect(failure(() => parseProductId(id))).toMatchObject({ status: 400 })
    },
  )
})

describe('parsePaginationQuery', () => {
  it('returns nothing for a query without paging, so the service decides the defaults', () => {
    expect(parsePaginationQuery({})).toEqual({})
  })

  it('turns the digits into numbers', () => {
    expect(parsePaginationQuery({ page: '2', limit: '10' })).toEqual({ page: 2, limit: 10 })
    expect(parsePaginationQuery({ limit: '50' })).toEqual({ limit: 50 })
  })

  it('ignores parameters it does not know', () => {
    expect(parsePaginationQuery({ page: '2', sort: 'price', q: 'x' })).toEqual({ page: 2 })
  })

  it('leaves the range to the service: 0 and big numbers are still numbers', () => {
    expect(parsePaginationQuery({ page: '0', limit: '100000' })).toEqual({ page: 0, limit: 100000 })
  })

  it.each([
    ['text', { page: 'abc' }],
    ['an empty value', { limit: '' }],
    ['a space', { page: ' ' }],
    ['a decimal', { page: '1.5' }],
    ['a negative number', { page: '-1' }],
    ['a plus sign', { limit: '+5' }],
    ['an exponent', { limit: '1e2' }],
    ['hexadecimal', { limit: '0x10' }],
    ['more than 9 digits', { page: '1234567890' }],
    ['a repeated parameter', { page: ['1', '2'] }],
    ['an operator object', { page: { $gt: '' } }],
    ['Infinity', { limit: 'Infinity' }],
  ])('rejects %s with a 400', (_name, query) => {
    const error = failure(() => parsePaginationQuery(query))

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 400, code: 'invalid_pagination' })
  })
})

describe('catalogSchema', () => {
  it('accepts the real catalog', () => {
    const result = catalogSchema.safeParse(readSourceCatalog())

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(31)
  })

  it('rejects an empty catalog: that is a mistake, not a catalog', () => {
    expect(catalogSchema.safeParse([]).success).toBe(false)
  })
})
