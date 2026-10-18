import { z } from 'zod'
import {
  DEMO_PAYMENT_TIMINGS,
  initialPayment,
  toPublicPayment,
} from '../../../server/src/orders/payment'
import { orderPageSchema, orderSchema, readPayment } from './orderSchema'

/**
 * The API is deployed before the site, so for a while the site that is live reads the new answers. This
 * is the order schema that site has (a frozen copy of the one before payments existed): it must still
 * read an order with a payment, and a page of them, as the orders they were.
 */
const before = z.object({
  orderNumber: z.string().min(1),
  createdAt: z.iso.datetime(),
  status: z.literal('placed'),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        name: z.string().min(1),
        unitPrice: z.number().int().positive(),
        originalUnitPrice: z.number().int().positive().optional(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  total: z.number().int().nonnegative(),
  originalTotal: z.number().int().nonnegative(),
  savings: z.number().int().nonnegative(),
  delivery: z.object({
    fullName: z.string(),
    email: z.string(),
    phone: z.string(),
    city: z.string(),
    street: z.string(),
    houseNumber: z.string(),
    apartment: z.string(),
    postalCode: z.string(),
    notes: z.string(),
  }),
})
const pageBefore = z.object({
  items: z.array(before),
  page: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

const order = {
  orderNumber: 'DEMO-7K2M9QX4',
  createdAt: '2026-10-20T10:00:00.000Z',
  status: 'placed',
  lines: [{ productId: 'PSU-1', name: 'ספק כוח', unitPrice: 1000, quantity: 1 }],
  total: 1000,
  originalTotal: 1000,
  savings: 0,
  delivery: {
    fullName: 'נתנאל כהן',
    email: 'n@example.com',
    phone: '0501234567',
    city: 'חיפה',
    street: 'הנשיא',
    houseNumber: '12',
    apartment: '',
    postalCode: '',
    notes: '',
  },
}
const payment = toPublicPayment(
  order.orderNumber,
  initialPayment(new Date(order.createdAt), DEMO_PAYMENT_TIMINGS),
)

describe('the order schema of the site that is live while the API is newer', () => {
  it('reads an order with a payment, and a page of them, without the payment', () => {
    const withPayment = { ...order, payment }

    expect(before.parse(withPayment)).toEqual(order)
    expect(
      pageBefore.parse({ items: [withPayment], page: 1, limit: 20, total: 1, totalPages: 1 }).items,
    ).toEqual([order])
  })
})

describe('the order schema of this site', () => {
  it('reads an order with no payment, a null one, and a payment, and tells them apart', () => {
    expect(readPayment(orderSchema.parse(order))).toEqual({ kind: 'legacy' })
    expect(readPayment(orderSchema.parse({ ...order, payment: null }))).toEqual({ kind: 'legacy' })
    expect(readPayment(orderSchema.parse({ ...order, payment }))).toEqual({ kind: 'ok', payment })
  })

  it('still reads the order when its payment is not what the server makes, and says so', () => {
    const parsed = orderSchema.parse({ ...order, payment: { ...payment, state: 'charged' } })

    expect(parsed.orderNumber).toBe(order.orderNumber)
    expect(readPayment(parsed)).toEqual({ kind: 'malformed' })
    expect(
      orderPageSchema.safeParse({ items: [parsed], page: 1, total: 1, totalPages: 1 }).success,
    ).toBe(true)
  })
})
