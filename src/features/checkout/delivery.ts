import { z } from 'zod'
// The extensions are required because the API (server/) imports this file as well: it runs as Node
// ES modules, which do not resolve extensionless imports or the `@` alias. The app is not affected.
import { emailField, phoneField, requiredText } from '../../lib/validation.ts'

/**
 * Who an order is for and where it goes: the part of the checkout form that the API also stores.
 * The form checks it first to help the visitor; the API checks it again, because only the API can
 * be trusted.
 */
export const deliveryDetailsSchema = z.object({
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
})

export type DeliveryDetails = z.infer<typeof deliveryDetailsSchema>
