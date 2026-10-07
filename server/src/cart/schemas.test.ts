import { describe, expect, it } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
import { parseAddItemBody, parseSetQuantityBody } from './schemas.ts'

function failure(run: () => unknown): HttpError {
  try {
    run()
  } catch (error) {
    if (error instanceof HttpError) return error
    throw error
  }
  throw new Error('it did not throw')
}

describe('parseAddItemBody', () => {
  it('accepts a product and a quantity', () => {
    expect(parseAddItemBody({ productId: 'GV-N4060', quantity: 3 })).toEqual({
      productId: 'GV-N4060',
      quantity: 3,
    })
  })

  it('adds one when no quantity is given, like the add button of the storefront', () => {
    expect(parseAddItemBody({ productId: 'GV-N4060' })).toEqual({
      productId: 'GV-N4060',
      quantity: 1,
    })
  })

  it('accepts the smallest and the largest quantity', () => {
    expect(parseAddItemBody({ productId: 'A', quantity: 1 }).quantity).toBe(1)
    expect(parseAddItemBody({ productId: 'A', quantity: 99 }).quantity).toBe(99)
  })

  it('reads only the product and the quantity: a price, a name or an account in the body is dropped', () => {
    expect(
      parseAddItemBody({
        productId: 'GV-N4060',
        quantity: 2,
        price: 1,
        name: 'Free',
        userId: 'someone-else',
      }),
    ).toEqual({ productId: 'GV-N4060', quantity: 2 })
  })

  it.each([
    ['no body', undefined],
    ['a body that is a list', []],
    ['no product', { quantity: 1 }],
    ['an empty product id', { productId: '' }],
    ['a product id with a space', { productId: 'A 1' }],
    ['a product id that is an object', { productId: { $ne: '' } }],
    ['a product id that is too long', { productId: 'A'.repeat(65) }],
    ['a quantity of 0', { productId: 'A', quantity: 0 }],
    ['a negative quantity', { productId: 'A', quantity: -1 }],
    ['a quantity of 100', { productId: 'A', quantity: 100 }],
    ['a fractional quantity', { productId: 'A', quantity: 1.5 }],
    ['a quantity that is text', { productId: 'A', quantity: '2' }],
    ['a quantity that is null', { productId: 'A', quantity: null }],
    ['a quantity that is not a number', { productId: 'A', quantity: Number.NaN }],
  ])('refuses %s with a 400 invalid_input', (_name, body) => {
    const error = failure(() => parseAddItemBody(body))

    expect(error.status).toBe(400)
    expect(error.code).toBe('invalid_input')
  })

  it('names the field that is wrong, never its value', () => {
    const error = failure(() => parseAddItemBody({ productId: 'A', quantity: 'SECRET-100' }))

    expect(error.message).toBe('The field "quantity" is not valid')
    expect(error.message).not.toContain('SECRET')
  })
})

describe('parseSetQuantityBody', () => {
  it('accepts a quantity from 1 to 99', () => {
    expect(parseSetQuantityBody({ quantity: 1 })).toBe(1)
    expect(parseSetQuantityBody({ quantity: 99 })).toBe(99)
  })

  it('needs the quantity: setting nothing is not an update', () => {
    const error = failure(() => parseSetQuantityBody({}))

    expect(error.code).toBe('invalid_input')
  })

  it.each([0, -3, 100, 2.5, '5', null, Number.POSITIVE_INFINITY])(
    'refuses a quantity of %j',
    (quantity) => {
      const error = failure(() => parseSetQuantityBody({ quantity }))

      expect(error.status).toBe(400)
      expect(error.code).toBe('invalid_input')
    },
  )
})
