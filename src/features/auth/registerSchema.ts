import { z } from 'zod'
import { emailField, requiredText } from '@/lib/validation'
import { passwordProblem, type PasswordProblem } from './passwordPolicy'
import {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordIsEmail,
} from './rules'

/**
 * The registration form's rules. The API checks the same rules again (rules.ts and passwordPolicy.ts are
 * shared with it), because it cannot trust the form. This file is apart from the sign-in form's schemas
 * because it carries the list of common passwords, which signing in has no use for.
 */
const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  'too-short': `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`,
  'too-long': `הסיסמה ארוכה מדי (עד ${PASSWORD_MAX_LENGTH} תווים)`,
  malformed: 'הסיסמה מכילה תווים שאינם תקינים.',
  common: 'הסיסמה הזו נפוצה מדי. בחרו סיסמה אחרת.',
}

export const registerSchema = z
  .object({
    name: requiredText('שם', { min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH }),
    email: emailField,
    password: z
      .string()
      .min(1, 'יש להזין סיסמה')
      .superRefine((password, ctx) => {
        // An empty password has its message already.
        const problem = password === '' ? null : passwordProblem(password)
        if (problem) ctx.addIssue({ code: 'custom', message: PASSWORD_MESSAGES[problem] })
      }),
    confirmPassword: z.string().min(1, 'יש לאשר את הסיסמה'),
  })
  .refine((values) => !passwordIsEmail(values.password, values.email), {
    path: ['password'],
    message: 'הסיסמה לא יכולה להיות זהה לכתובת האימייל.',
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'הסיסמאות אינן תואמות',
  })

export type RegisterValues = z.infer<typeof registerSchema>
