import { z } from 'zod'
import { deliveryDetailsSchema } from './delivery.ts'

/**
 * The delivery details of the demo checkout (shared with the API, see `delivery.ts`), and the
 * visitor's confirmation that it is a demo. There is deliberately no payment or card field:
 * nothing is charged.
 */
export const checkoutSchema = deliveryDetailsSchema.extend({
  acceptDemo: z.boolean().refine((value) => value, 'יש לאשר שזו הזמנת הדגמה'),
})

export type CheckoutValues = z.infer<typeof checkoutSchema>
