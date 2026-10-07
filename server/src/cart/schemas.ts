import { z } from 'zod'
import { MAX_QUANTITY } from '../../../src/features/cart/limits.ts'
import { HttpError } from '../lib/httpError.ts'
import { productIdSchema } from '../products/schemas.ts'

// The same limits as the storefront's cart (src/features/cart/limits.ts). Only ids and quantities
// are read: a price or a name in a body is dropped, as the cart keeps neither.
const quantity = z.number().int().min(1).max(MAX_QUANTITY)

const addItemSchema = z.object({
  productId: productIdSchema,
  /** Like adding to the cart in the storefront: one, unless said otherwise. */
  quantity: quantity.default(1),
})
const setQuantitySchema = z.object({ quantity })

export type AddItemInput = z.infer<typeof addItemSchema>

/** The first invalid part, by name and never by value. */
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (result.success) return result.data
  const field = result.error.issues[0]?.path.map(String).join('.')
  throw new HttpError(
    400,
    'invalid_input',
    field ? `The field "${field}" is not valid` : 'The request body is not valid',
  )
}

export const parseAddItemBody = (body: unknown) => parse(addItemSchema, body)
export const parseSetQuantityBody = (body: unknown) => parse(setQuantitySchema, body).quantity
