import { z } from 'zod'
import { emailField, phoneField, requiredText } from '@/lib/validation'

/**
 * The delivery details of the demo checkout. There is deliberately no payment or card field:
 * nothing is charged and nothing is sent anywhere.
 */
export const checkoutSchema = z.object({
  fullName: requiredText('שם מלא', { min: 2, max: 80 }),
  email: emailField,
  phone: phoneField,
  city: requiredText('עיר', { min: 2, max: 60 }),
  street: requiredText('רחוב', { min: 2, max: 80 }),
  houseNumber: z.string().trim().min(1, 'יש להזין מספר בית').max(10, 'מספר הבית ארוך מדי'),
  apartment: z.string().trim().max(10, 'מספר הדירה ארוך מדי'),
  postalCode: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{7}$/.test(value), 'המיקוד חייב להכיל 7 ספרות'),
  notes: z.string().trim().max(300, 'ההערות ארוכות מדי (עד 300 תווים)'),
  acceptDemo: z.boolean().refine((value) => value, 'יש לאשר שזו הזמנת הדגמה'),
})

export type CheckoutValues = z.infer<typeof checkoutSchema>
