import { z } from 'zod'
import type { CartItem } from '@/features/cart/cartStore'
import { buildCartLines } from '@/features/cart/summary'
import type { Product } from '@/features/products/schema'

/**
 * The demo "order". Nothing is charged, sent or stored: placing an order only produces a
 * reference number and a list of what was ordered. Prices are not part of it: the confirmation
 * page works them out from the catalog like every other page, so totals are never stored.
 */
export interface DemoOrder {
  orderId: string
  items: CartItem[]
  email: string
}

export class EmptyOrderError extends Error {
  constructor() {
    super('The order has no products that are available in the catalog')
    this.name = 'EmptyOrderError'
  }
}

function createOrderId() {
  const number = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000
  return `DEMO-${String(number).padStart(6, '0')}`
}

export function placeDemoOrder({
  items,
  products,
  email,
}: {
  items: readonly CartItem[]
  products: readonly Product[]
  email: string
}): DemoOrder {
  // Only products that exist in the catalog can be ordered.
  const lines = buildCartLines(items, products)
  if (lines.length === 0) throw new EmptyOrderError()

  return {
    orderId: createOrderId(),
    items: lines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
    email,
  }
}

/** What the checkout hands to the confirmation page through router state. */
export const checkoutSuccessStateSchema = z.object({
  orderId: z.string().regex(/^DEMO-\d{6}$/),
  email: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1),
})

export type CheckoutSuccessState = z.infer<typeof checkoutSuccessStateSchema>
