import { z } from 'zod'
import { emailField, requiredText } from '@/lib/validation'
import {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordHasDigit,
  passwordHasLetter,
} from './rules'

/**
 * The forms check these first to help the visitor (in Hebrew). The API checks the same rules
 * again (src/features/auth/rules.ts is shared with it), because it cannot trust the form.
 */
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'יש להזין סיסמה').max(PASSWORD_MAX_LENGTH, 'הסיסמה ארוכה מדי'),
})

export const registerSchema = z
  .object({
    name: requiredText('שם', { min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH }),
    email: emailField,
    password: z
      .string()
      .min(1, 'יש להזין סיסמה')
      .min(PASSWORD_MIN_LENGTH, `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`)
      .max(PASSWORD_MAX_LENGTH, `הסיסמה ארוכה מדי (עד ${PASSWORD_MAX_LENGTH} תווים)`)
      .refine(passwordHasLetter, 'הסיסמה חייבת להכיל לפחות אות אחת')
      .refine(passwordHasDigit, 'הסיסמה חייבת להכיל לפחות ספרה אחת'),
    confirmPassword: z.string().min(1, 'יש לאשר את הסיסמה'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'הסיסמאות אינן תואמות',
  })

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
