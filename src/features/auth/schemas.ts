import { z } from 'zod'
import { emailField } from '@/lib/validation'
import { PASSWORD_MAX_LENGTH } from './rules'

/**
 * The sign-in form checks this first to help the visitor (in Hebrew). The API checks the same rules
 * again (src/features/auth/rules.ts is shared with it), because it cannot trust the form. Signing in
 * accepts any password that fits: the rules for a new one (registerSchema.ts) may have been others when
 * the account was made.
 */
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'יש להזין סיסמה').max(PASSWORD_MAX_LENGTH, 'הסיסמה ארוכה מדי'),
})

export type LoginValues = z.infer<typeof loginSchema>
