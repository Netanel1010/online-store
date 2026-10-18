import { z } from 'zod'
import { isWellFormedPayment, publicPaymentSchema, type PublicPayment } from './payment'

/**
 * An order as the API shows it (`PublicOrder`). It is read as it is: the names, the prices and the
 * totals are the ones the server worked out and froze when the order was placed, and nothing here
 * recalculates them from the catalog. The delivery details are read as text: the rules of the form
 * may change, and an order that was placed under older rules must still open.
 */
const lineSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  unitPrice: z.number().int().positive(),
  originalUnitPrice: z.number().int().positive().optional(),
  quantity: z.number().int().positive(),
})

export const orderSchema = z.object({
  orderNumber: z.string().min(1),
  createdAt: z.iso.datetime(),
  status: z.literal('placed'),
  lines: z.array(lineSchema).min(1),
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
  /**
   * The simulated payment, read as it comes: whether it can be shown is `readPayment`, so that a
   * payment that is wrong never hides the rest of the order.
   */
  payment: z.unknown().optional(),
})

/**
 * The payment of an order, as the page may use it: `legacy` for an order placed before payments
 * existed (or read from an API that does not have them yet), `ok` with the payment, or `malformed`
 * when it is not what the server makes (not to be shown, and not to be acted on).
 */
export type PaymentRead =
  { kind: 'legacy' } | { kind: 'ok'; payment: PublicPayment } | { kind: 'malformed' }

export function readPayment(order: Pick<Order, 'payment'>): PaymentRead {
  if (order.payment === undefined || order.payment === null) return { kind: 'legacy' }
  const parsed = publicPaymentSchema.safeParse(order.payment)
  if (!parsed.success || !isWellFormedPayment(parsed.data)) return { kind: 'malformed' }
  return { kind: 'ok', payment: parsed.data }
}

/** Whether the order has an attempt the fictional provider has not decided yet, or a decision due. */
export function paymentIsMoving(order: Pick<Order, 'payment'>): boolean {
  const read = readPayment(order)
  return (
    read.kind === 'ok' &&
    (read.payment.pendingUpdate ||
      read.payment.attempts.some((attempt) => attempt.status === 'processing'))
  )
}

/** One page of the account's orders, the newest first (the API's page shape, as the products have). */
export const orderPageSchema = z.object({
  items: z.array(orderSchema),
  page: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

export type OrderPage = z.infer<typeof orderPageSchema>
export type Order = z.infer<typeof orderSchema>
export type OrderLine = Order['lines'][number]
