import { z } from 'zod'
// The extension is required because the API (server/) imports this file through the checkout schema.
import { asciiDigits, characterCount, hasNonText, stripInvisible } from './textRules.ts'

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

/** A phone number is never this long, however it is written (`+972 (0) 50-123-4567` is 20). */
export const PHONE_RAW_MAX_LENGTH = 30
const PHONE_INVALID = 'מספר הטלפון אינו תקין'

/**
 * Israeli numbering plan, as the digits of the number written locally: a landline is 0 and one of
 * 2, 3, 4, 8, 9 and seven digits; a mobile number is 05 and eight digits; an internet (VoIP) number
 * is 07 and eight digits. A number outside it is not one that can be reached, whatever its shape.
 * This is the shape of a number; it does not say that anyone has it.
 */
export const ISRAELI_NUMBER = /^0(?:[23489]\d{7}|5\d{8}|7\d{8})$/

/** Spaces of any kind, any dash, dots and brackets: what people put between the digits of a number. */
const PHONE_SEPARATORS = /[\p{Zs}\p{Pd}.()]/gu

/**
 * A phone number as it is stored: the digits as written locally (`0501234567`). It takes the
 * separators out (spaces of any kind, dashes, dots and brackets, and nothing else: not a tab or a
 * line break), the invisible marks that a copy from a right-to-left page brings, Arabic-Indic and
 * full-width digits, and the international prefix (`+972`, `00972` or `972`, with or without the 0
 * that some write after it). What cannot be read as a number stays as it is, for the check. It
 * is meant for a value that `hasNonText` has found nothing wrong with, and `phoneField` asks first.
 */
export function normalizePhone(value: string): string {
  const digits = asciiDigits(stripInvisible(value)).replace(PHONE_SEPARATORS, '')
  const international = /^(?:\+|00)?972(\d+)$/.exec(digits)
  return international ? `0${(international[1] ?? '').replace(/^0/, '')}` : digits
}

/**
 * An Israeli phone number, in any common way of writing it, stored as `0501234567`. A number of
 * another country is not accepted: the demo store only has Israeli customers.
 */
export const phoneField = z
  .string()
  .refine((value) => characterCount(value) <= PHONE_RAW_MAX_LENGTH, PHONE_INVALID)
  // As typed, before anything is removed: a tab or a line break among the digits is not a separator.
  .refine((value) => !hasNonText(value), PHONE_INVALID)
  .transform(normalizePhone)
  .pipe(z.string().min(1, 'יש להזין מספר טלפון').regex(ISRAELI_NUMBER, PHONE_INVALID))
