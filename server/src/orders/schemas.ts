import { z } from 'zod'
import { MAX_ORDER_LINES, MAX_QUANTITY } from '../../../src/features/cart/limits.ts'
import { deliveryDetailsSchema } from '../../../src/features/checkout/delivery.ts'
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

export const orderNotFound = () => new HttpError(404, 'order_not_found', 'The order was not found')

/**
 * An order number in an address. One that cannot be an order number is the same "not found" as one
 * nobody has: the answer does not say which orders could exist.
 */
export function parseOrderNumber(value: unknown): string {
  if (typeof value !== 'string' || !ORDER_NUMBER_PATTERN.test(value)) throw orderNotFound()
  return value
}
