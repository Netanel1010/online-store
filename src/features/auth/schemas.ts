import { z } from 'zod'
import { emailField, requiredText } from '@/lib/validation'

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'יש להזין סיסמה'),
})

export const registerSchema = z
  .object({
    name: requiredText('שם', { min: 2, max: 60 }),
    email: emailField,
    password: z
      .string()
      .min(1, 'יש להזין סיסמה')
      .min(8, 'הסיסמה חייבת להכיל לפחות 8 תווים')
      .regex(/\p{L}/u, 'הסיסמה חייבת להכיל לפחות אות אחת')
      .regex(/\d/, 'הסיסמה חייבת להכיל לפחות ספרה אחת'),
    confirmPassword: z.string().min(1, 'יש לאשר את הסיסמה'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'הסיסמאות אינן תואמות',
  })

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
