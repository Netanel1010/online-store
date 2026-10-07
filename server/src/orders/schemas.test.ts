import { describe, expect, it } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
import { parseIdempotencyKey, parseOrderNumber, parsePlaceOrderBody } from './schemas.ts'

const DELIVERY = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '050-1234567',
  city: 'חיפה',
  street: 'הנשיא',
  houseNumber: '12',
  apartment: '',
  postalCode: '',
  notes: '',
}
const body = (overrides: Record<string, unknown> = {}) => ({
  items: [{ productId: 'GV-N4060', quantity: 2 }],
  delivery: DELIVERY,
  ...overrides,
})

function failure(run: () => unknown): HttpError {
  try {
    run()
  } catch (error) {
    if (error instanceof HttpError) return error
    throw error
  }
  throw new Error('it did not throw')
}

describe('parsePlaceOrderBody', () => {
  it('accepts ids, quantities, the delivery details and an optional expected total', () => {
    const parsed = parsePlaceOrderBody(body({ expectedTotal: 3000 }))

    expect(parsed.items).toEqual([{ productId: 'GV-N4060', quantity: 2 }])
    expect(parsed.delivery.fullName).toBe('נתנאל כהן')
    expect(parsed.expectedTotal).toBe(3000)
    expect(parsePlaceOrderBody(body()).expectedTotal).toBeUndefined()
  })

  it('does not read a price, a name or a total that a client adds', () => {
    const parsed = parsePlaceOrderBody(
      body({
        total: 1,
        userId: 'someone-else',
        items: [{ productId: 'GV-N4060', quantity: 1, price: 1, name: 'Free card', unitPrice: 1 }],
      }),
    )

    expect(parsed).toEqual({
      items: [{ productId: 'GV-N4060', quantity: 1 }],
      delivery: DELIVERY,
    })
  })

  it('trims the delivery details like the form does', () => {
    const parsed = parsePlaceOrderBody(body({ delivery: { ...DELIVERY, city: '  חיפה  ' } }))

    expect(parsed.delivery.city).toBe('חיפה')
  })

  it.each([
    ['no body', undefined],
    ['a body that is not an object', 'order'],
    ['no items', { delivery: DELIVERY }],
    ['an empty list of items', body({ items: [] })],
    ['items that are not a list', body({ items: 'GV-N4060' })],
    ['more than 50 different products', body({ items: lines(51) })],
    ['a product twice', body({ items: [line('A-1', 1), line('A-1', 2)] })],
    ['a quantity of 0', body({ items: [line('A-1', 0)] })],
    ['a quantity of 100', body({ items: [line('A-1', 100)] })],
    ['a fractional quantity', body({ items: [line('A-1', 1.5)] })],
    ['a quantity that is text', body({ items: [line('A-1', '2')] })],
    ['a product id with a space', body({ items: [line('A 1', 1)] })],
    ['a product id that is an object', body({ items: [{ productId: { $ne: '' }, quantity: 1 }] })],
    ['no delivery details', { items: [line('A-1', 1)] }],
    ['a bad phone number', body({ delivery: { ...DELIVERY, phone: '123' } })],
    ['a bad email', body({ delivery: { ...DELIVERY, email: 'nope' } })],
    ['a bad postal code', body({ delivery: { ...DELIVERY, postalCode: '12' } })],
    ['notes over 300 characters', body({ delivery: { ...DELIVERY, notes: 'x'.repeat(301) } })],
    ['a negative expected total', body({ expectedTotal: -1 })],
    ['a fractional expected total', body({ expectedTotal: 10.5 })],
    ['an expected total that is text', body({ expectedTotal: '10' })],
  ])('refuses %s with a 400 invalid_input', (_name, value) => {
    const error = failure(() => parsePlaceOrderBody(value))

    expect(error.status).toBe(400)
    expect(error.code).toBe('invalid_input')
  })

  it('accepts 50 different products and a quantity of 99', () => {
    expect(() => parsePlaceOrderBody(body({ items: lines(50) }))).not.toThrow()
    expect(() => parsePlaceOrderBody(body({ items: [line('A-1', 99)] }))).not.toThrow()
  })

  it('names the field that is wrong, never its value', () => {
    const error = failure(() =>
      parsePlaceOrderBody(body({ delivery: { ...DELIVERY, phone: '999-SECRET' } })),
    )

    expect(error.message).toBe('The field "delivery.phone" is not valid')
    expect(error.message).not.toContain('SECRET')
  })
})

describe('parseIdempotencyKey', () => {
  it('accepts a UUID and other tokens of 16 to 128 safe characters', () => {
    expect(parseIdempotencyKey('3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b')).toBe(
      '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
    )
    expect(parseIdempotencyKey('a'.repeat(16))).toBe('a'.repeat(16))
    expect(parseIdempotencyKey('A_b-'.repeat(32))).toHaveLength(128)
  })

  it('is required: without it a retry could not be told from a second order', () => {
    const error = failure(() => parseIdempotencyKey(undefined))

    expect(error.status).toBe(400)
    expect(error.code).toBe('idempotency_key_required')
  })

  it.each([
    '',
    'short',
    'a'.repeat(15),
    'a'.repeat(129),
    'has spaces in it 1234',
    'semi;colon-1234567890',
    'new\nline-1234567890',
    'ünïcode-1234567890ab',
    ['a'.repeat(16)],
    42,
  ])('refuses %j with a 400 invalid_idempotency_key', (value) => {
    const error = failure(() => parseIdempotencyKey(value))

    expect(error.status).toBe(400)
    expect(error.code).toBe('invalid_idempotency_key')
  })
})

describe('parseOrderNumber', () => {
  it('accepts an order number', () => {
    expect(parseOrderNumber('DEMO-7K2M9QX4')).toBe('DEMO-7K2M9QX4')
  })

  it.each(['demo-7k2m9qx4', 'DEMO-1', '../etc/passwd', '{"$ne":""}', '', undefined, 5])(
    'says "not found", not "invalid", for %j',
    (value) => {
      const error = failure(() => parseOrderNumber(value))

      expect(error.status).toBe(404)
      expect(error.code).toBe('order_not_found')
    },
  )
})

function line(productId: string, quantity: unknown) {
  return { productId, quantity }
}
function lines(count: number) {
  return Array.from({ length: count }, (_, index) => line(`P-${index}`, 1))
}
