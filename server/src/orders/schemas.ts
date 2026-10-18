import { z } from 'zod'
import { MAX_ORDER_LINES, MAX_QUANTITY } from '../../../src/features/cart/limits.ts'
import { deliveryDetailsSchema } from '../../../src/features/checkout/delivery.ts'
import {
  MAX_PAYMENT_ATTEMPTS,
  PAYMENT_SCENARIOS,
  type PaymentScenario,
} from '../../../src/features/orders/payment.ts'
import { HttpError } from '../lib/httpError.ts'
import { productIdSchema } from '../products/schemas.ts'
import { ORDER_NUMBER_PATTERN } from './orderNumber.ts'

const orderItemSchema = z.object({
  productId: productIdSchema,
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
})

// Only ids and quantities come from the client. A price, a name or a total in the body is not read:
// the server works those out from its own products. Unknown fields are dropped.
const placeOrderSchema = z.object({
  items: z
    .array(orderItemSchema)
    .min(1)
    .max(MAX_ORDER_LINES)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, {
      message: 'a product can be in the order once',
    }),
  delivery: deliveryDetailsSchema,
  /** The total the visitor saw. When it is not what the server works out, nothing is ordered. */
  expectedTotal: z.number().int().nonnegative().optional(),
})

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>

/** 16 to 128 characters of a UUID-like token: enough to be unique, short enough to be stored and logged. */
const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)

/** The first invalid part, by name and never by value: the body holds an address and a phone number. */
function describe(path: readonly PropertyKey[]): string {
  return path.map(String).join('.')
}

export function parsePlaceOrderBody(body: unknown): PlaceOrderInput {
  const result = placeOrderSchema.safeParse(body)
  if (result.success) return result.data
  const where = describe(result.error.issues[0]?.path ?? [])
  throw new HttpError(
    400,
    'invalid_input',
    where ? `The field "${where}" is not valid` : 'The request body is not valid',
  )
}

/** The `Idempotency-Key` header. Without one a retry could not be told from a second order. */
export function parseIdempotencyKey(value: unknown): string {
  if (value === undefined) {
    throw new HttpError(
      400,
      'idempotency_key_required',
      'The Idempotency-Key header is required to place an order',
    )
  }
  const result = idempotencyKeySchema.safeParse(value)
  if (!result.success) {
    throw new HttpError(
      400,
      'invalid_idempotency_key',
      'The Idempotency-Key must be 16 to 128 letters, digits, "-" or "_"',
    )
  }
  return result.data
}

const lookupSchema = z.object({ idempotencyKey: idempotencyKeySchema })

/**
 * The body of `POST /api/orders/lookup`: the idempotency key of an attempt. It travels in the body,
 * never in the address, so it is not in a path or a query string that a proxy, a browser history or
 * a log line could keep. Only the name of an invalid field is ever reported, never its value.
 */
export function parseLookupBody(body: unknown): string {
  const result = lookupSchema.safeParse(body)
  if (result.success) return result.data.idempotencyKey
  const where = describe(result.error.issues[0]?.path ?? [])
  throw new HttpError(
    400,
    'invalid_input',
    where ? `The field "${where}" is not valid` : 'The request body is not valid',
  )
}

export const orderNotFound = () => new HttpError(404, 'order_not_found', 'The order was not found')

/** A short wait before the same request is sent again, for the 503s that a retry resolves. */
const RETRY_SOON = { 'Retry-After': '2' } as const

/**
 * The order exists, but not yet on a majority of the database: it could still be undone by a
 * failover, so it is neither shown nor reported missing. The same request again resolves it.
 */
export const orderNotConfirmed = () =>
  new HttpError(503, 'order_not_confirmed', 'The order is not confirmed yet. Try again', RETRY_SOON)

/** A write may have been applied but was not confirmed: asking again, with the same key, is safe. */
export const writeNotConfirmed = () =>
  new HttpError(
    503,
    'write_not_confirmed',
    'The change is not confirmed yet. Try again',
    RETRY_SOON,
  )

/** The database could not be asked safely: nothing is reported. */
export const databaseUnavailable = () =>
  new HttpError(
    503,
    'database_unavailable',
    'The order cannot be read right now. Try again',
    RETRY_SOON,
  )

// The bodies of the payment commands are strict: a field the API does not read is refused, not
// dropped, so a client that sends a status, an outcome or a payment state is told it cannot.
const startPaymentSchema = z.strictObject({ scenario: z.enum(PAYMENT_SCENARIOS) })
const emptyBodySchema = z.strictObject({})

function invalidBody(error: z.ZodError): HttpError {
  const issue = error.issues[0]
  const where = issue?.code === 'unrecognized_keys' ? issue.keys[0] : describe(issue?.path ?? [])
  return new HttpError(
    400,
    'invalid_input',
    where ? `The field "${where}" is not valid` : 'The request body is not valid',
  )
}

/** The body that starts a simulated payment: only the scenario the fictional provider will follow. */
export function parseStartPaymentBody(body: unknown): PaymentScenario {
  const result = startPaymentSchema.safeParse(body)
  if (!result.success) throw invalidBody(result.error)
  return result.data.scenario
}

/** The body of a command that needs none (cancel, refund): nothing, or an empty object. */
export function parseEmptyBody(body: unknown): void {
  const result = emptyBodySchema.safeParse(body ?? {})
  if (!result.success) throw invalidBody(result.error)
}

/** The number of an attempt in an address. Anything that cannot be one is an attempt not found. */
export function parseAttemptNumber(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]$/.test(value) || Number(value) > MAX_PAYMENT_ATTEMPTS) {
    throw new HttpError(404, 'payment_attempt_not_found', 'The attempt was not found')
  }
  return Number(value)
}

/**
 * An order number in an address. One that cannot be an order number is the same "not found" as one
 * nobody has: the answer does not say which orders could exist.
 */
export function parseOrderNumber(value: unknown): string {
  if (typeof value !== 'string' || !ORDER_NUMBER_PATTERN.test(value)) throw orderNotFound()
  return value
}
