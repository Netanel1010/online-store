import { z } from 'zod'

/** Building blocks shared by the login, registration and checkout forms (Hebrew messages). */

export const emailField = z
  .string()
  .trim()
  .min(1, 'יש להזין כתובת אימייל')
  .pipe(z.email('כתובת האימייל אינה תקינה'))

export function requiredText(label: string, { min = 2, max = 80 } = {}) {
  return z
    .string()
    .trim()
    .min(1, `יש להזין ${label}`)
    .min(min, `${label} קצר מדי`)
    .max(max, `${label} ארוך מדי`)
}

/** Israeli phone number: digits only after removing spaces, hyphens and a leading +972. */
export const phoneField = z
  .string()
  .trim()
  .min(1, 'יש להזין מספר טלפון')
  .refine((value) => /^0\d{8,9}$/.test(normalizePhone(value)), 'מספר הטלפון אינו תקין')

export function normalizePhone(value: string): string {
  const digits = value.replace(/[\s\-()]/g, '')
  return digits.startsWith('+972') ? `0${digits.slice(4)}` : digits
}
