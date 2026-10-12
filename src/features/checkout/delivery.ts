import { z } from 'zod'
// The extensions are required because the API (server/) imports this file as well: it runs as Node
// ES modules, which do not resolve extensionless imports or the `@` alias. The app is not affected.
import { EMAIL_MAX_LENGTH } from '../auth/rules.ts'
import { phoneField } from '../../lib/validation.ts'
import { characterCount, normalizeLine, stripInvisible } from '../../lib/textRules.ts'

/**
 * Who an order is for and where it goes: the part of the checkout form that the API also stores.
 * The form checks it first to help the visitor; the API checks it again, because only the API can
 * be trusted. Both run the same rules, and both store the value the rules produce (the invisible
 * marks of a right-to-left copy dropped, the spaces tidied, a phone number written locally).
 *
 * These are rules about the shape of a value. Nothing here knows whether an address exists or
 * whether anything can be delivered to it, and no message may say so.
 */

/** The longest part before the @ of an address that can be delivered to (RFC 5321). */
const EMAIL_LOCAL_PART_MAX_LENGTH = 64
/** No value is read at all when it is longer than this, whatever the field: a limit on the work. */
const RAW_LINE_MAX_LENGTH = 500

const EMAIL_TOO_LONG = 'כתובת האימייל ארוכה מדי'
const EMAIL_INVALID = 'כתובת האימייל אינה תקינה'

/**
 * An address to send the order confirmation to. Written the way a copy from a right-to-left page
 * leaves it (with a direction mark in it) it is still read, and the mark is not stored. The
 * limits are those of the address itself, and it cannot begin with `+` or `-`, which a
 * spreadsheet reads as the start of a formula.
 */
export const deliveryEmailField = z
  .string()
  .max(RAW_LINE_MAX_LENGTH, EMAIL_TOO_LONG)
  .transform((value) => stripInvisible(value).trim())
  .pipe(
    z
      .string()
      .min(1, 'יש להזין כתובת אימייל')
      .pipe(z.email(EMAIL_INVALID))
      .refine((value) => value.length <= EMAIL_MAX_LENGTH, EMAIL_TOO_LONG)
      .refine(
        (value) => value.slice(0, value.lastIndexOf('@')).length <= EMAIL_LOCAL_PART_MAX_LENGTH,
        EMAIL_TOO_LONG,
      )
      .refine((value) => !/^[+-]/.test(value), EMAIL_INVALID),
  )

/**
 * What a name, a city or a street may be made of: letters of any script (Hebrew, Arabic, Latin, ...)
 * with their points and marks, digits, a space, the apostrophes and quotation marks of a place name
 * (`פ"ת`, `ז'בוטינסקי`, `O'Brien`), a dot, a comma, brackets, a slash, any dash (the Hebrew maqaf
 * as well) and the joiners that Persian needs. Everything else (`< > = | ; { }`, control and
 * direction characters, emoji) is not part of a name and is not stored.
 */
const NAME_CHARACTERS = /^[\p{L}\p{M}\p{Nd} '"’‘“”׳״.,()/\u200C\u200D\p{Pd}]+$/u
const HAS_LETTER = /\p{L}/u
const STARTS_WITH_LETTER_OR_DIGIT = /^[\p{L}\p{Nd}]/u

interface NameOptions {
  label: string
  min: number
  max: number
}

/** The first thing wrong with a name, a city or a street (already normalized), or null. */
function nameProblem(value: string, { label, min, max }: NameOptions): string | null {
  const length = characterCount(value)
  if (length === 0) return `יש להזין ${label}`
  if (length < min) return `${label} קצר מדי`
  if (length > max) return `${label} ארוך מדי`
  if (!NAME_CHARACTERS.test(value)) return `${label} מכיל תווים שאינם מותרים`
  if (!STARTS_WITH_LETTER_OR_DIGIT.test(value)) return `${label} חייב להתחיל באות או בספרה`
  if (!HAS_LETTER.test(value)) return `${label} חייב להכיל אותיות`
  return null
}

function nameField(options: NameOptions) {
  return z
    .string()
    .max(RAW_LINE_MAX_LENGTH, `${options.label} ארוך מדי`)
    .transform(normalizeLine)
    .pipe(
      z.string().superRefine((value, ctx) => {
        const message = nameProblem(value, options)
        if (message) ctx.addIssue({ code: 'custom', message })
      }),
    )
}

export const deliveryDetailsSchema = z.object({
  fullName: nameField({ label: 'שם מלא', min: 2, max: 80 }),
  email: deliveryEmailField,
  phone: phoneField,
  city: nameField({ label: 'עיר', min: 2, max: 60 }),
  street: nameField({ label: 'רחוב', min: 2, max: 80 }),
  houseNumber: z.string().trim().min(1, 'יש להזין מספר בית').max(10, 'מספר הבית ארוך מדי'),
  apartment: z.string().trim().max(10, 'מספר הדירה ארוך מדי'),
  postalCode: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{7}$/.test(value), 'המיקוד חייב להכיל 7 ספרות'),
  notes: z.string().trim().max(300, 'ההערות ארוכות מדי (עד 300 תווים)'),
})

export type DeliveryDetails = z.infer<typeof deliveryDetailsSchema>
