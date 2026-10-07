import { z } from 'zod'

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
})

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
