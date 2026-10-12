import { z } from 'zod'
// The extensions are required because the API (server/) imports this file as well: it runs as Node
// ES modules, which do not resolve extensionless imports or the `@` alias. The app is not affected.
import { EMAIL_MAX_LENGTH } from '../auth/rules.ts'
import { PHONE_RAW_MAX_LENGTH, phoneField } from '../../lib/validation.ts'
import {
  asciiDigits,
  characterCount,
  hasNonText,
  normalizeLine,
  normalizeLines,
  startsLikeFormula,
} from '../../lib/textRules.ts'

/**
 * Who an order is for and where it goes: the part of the checkout form that the API also stores.
 * The form checks it first to help the visitor; the API checks it again, because only the API can
 * be trusted. Both run the same rules, and both store the value the rules produce (the invisible
 * marks of a right-to-left copy dropped, the spaces tidied, a phone number written locally).
 *
 * These are rules about the shape of a value. Nothing here knows whether an address exists or
 * whether anything can be delivered to it, and no message may say so.
 */

/** No one-line value is read at all when it is longer than this, as it was typed: a limit on the work. */
const RAW_LINE_MAX_LENGTH = 500

/**
 * The limits of each field, in characters (an emoji is one).
 *
 * `raw` is the longest value that is read at all **as it was typed**, with its spaces, separators
 * and invisible marks: a limit on the work, and the only limit that a client can check without
 * normalizing the value first. The other limits are those of the value **once normalized**. They
 * are different things (`'א' + 499 spaces` is a valid name of one character and 500 raw ones), and
 * docs/openapi.yaml states both; a test keeps it in step with this table.
 */
export const DELIVERY_LIMITS = {
  fullName: { raw: RAW_LINE_MAX_LENGTH, min: 2, max: 80 },
  email: {
    raw: RAW_LINE_MAX_LENGTH,
    max: EMAIL_MAX_LENGTH,
    /** The longest part before the @ of an address that can be delivered to (RFC 5321). */
    localPartMax: 64,
  },
  phone: { raw: PHONE_RAW_MAX_LENGTH },
  city: { raw: RAW_LINE_MAX_LENGTH, min: 2, max: 60 },
  street: { raw: RAW_LINE_MAX_LENGTH, min: 2, max: 80 },
  houseNumber: { raw: RAW_LINE_MAX_LENGTH, max: 10 },
  apartment: { raw: RAW_LINE_MAX_LENGTH, max: 10 },
  postalCode: { raw: 20 },
  notes: { raw: 2000, max: 300, maxLines: 6 },
} as const

const EMAIL_TOO_LONG = 'כתובת האימייל ארוכה מדי'
const EMAIL_INVALID = 'כתובת האימייל אינה תקינה'

/**
 * A one-line value, read in the only safe order: first the value **as it was typed** is refused if
 * it holds anything that is not text (a tab, a line break, a control or direction character, ...),
 * and only then is it normalized. A value that is refused is never normalized, so that the
 * normalizing (which removes spaces and the marks of a right-to-left copy) cannot be what hides a
 * character from the check.
 */
function oneLine(refusal: string, tooLong: string, rawMax: number) {
  return z
    .string()
    .max(rawMax, tooLong)
    .refine((value) => !hasNonText(value), refusal)
    .transform(normalizeLine)
}

/**
 * An address to send the order confirmation to. Written the way a copy from a right-to-left page
 * leaves it (with a direction mark in it) it is still read, and the mark is not stored. The
 * limits are those of the address itself, and it cannot begin with `+` or `-`, which a
 * spreadsheet reads as the start of a formula.
 */
export const deliveryEmailField = oneLine(
  EMAIL_INVALID,
  EMAIL_TOO_LONG,
  DELIVERY_LIMITS.email.raw,
).pipe(
  z
    .string()
    .min(1, 'יש להזין כתובת אימייל')
    .pipe(z.email(EMAIL_INVALID))
    .refine((value) => value.length <= DELIVERY_LIMITS.email.max, EMAIL_TOO_LONG)
    .refine(
      (value) =>
        value.slice(0, value.lastIndexOf('@')).length <= DELIVERY_LIMITS.email.localPartMax,
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

interface NameLimits {
  raw: number
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

function nameField(label: string, { raw, min, max }: NameLimits) {
  const options: NameOptions = { label, min, max }
  return oneLine(`${label} מכיל תווים שאינם מותרים`, `${label} ארוך מדי`, raw).pipe(
    z.string().superRefine((value, ctx) => {
      const message = nameProblem(value, options)
      if (message) ctx.addIssue({ code: 'custom', message })
    }),
  )
}

/** What is written in the house number of an address that has none (a moshav, a kibbutz). */
const NO_HOUSE_NUMBER = ['ללא מספר', 'ללא']
/** A house number: digits and letters, and what joins them (`12א`, `12/4`, `12-14`, `12 א'`). */
const HOUSE_NUMBER_CHARACTERS = /^[\p{L}\p{Nd}/'"’׳״ .\p{Pd}]+$/u
const NOT_ZERO = /[1-9]/

/**
 * The house number. It holds a digit (`0` is not a house) unless it says that there is none
 * (`ללא מספר`, `ללא`). Digits typed as Arabic-Indic are stored as 0-9.
 */
const houseNumberField = oneLine(
  'מספר הבית אינו תקין',
  'מספר הבית ארוך מדי',
  DELIVERY_LIMITS.houseNumber.raw,
)
  .transform(asciiDigits)
  .pipe(
    z.string().superRefine((value, ctx) => {
      const length = characterCount(value)
      const message =
        length === 0
          ? 'יש להזין מספר בית'
          : length > DELIVERY_LIMITS.houseNumber.max
            ? 'מספר הבית ארוך מדי'
            : NO_HOUSE_NUMBER.includes(value) ||
                (HOUSE_NUMBER_CHARACTERS.test(value) &&
                  STARTS_WITH_LETTER_OR_DIGIT.test(value) &&
                  NOT_ZERO.test(value))
              ? null
              : 'מספר הבית אינו תקין'
      if (message) ctx.addIssue({ code: 'custom', message })
    }),
  )

/** An apartment, a floor or an entrance (`4`, `4א`, `קרקע`), when there is one. */
const APARTMENT_CHARACTERS = /^[\p{L}\p{Nd}/'"’׳״ \p{Pd}]+$/u

const apartmentField = oneLine(
  'מספר הדירה מכיל תווים שאינם מותרים',
  'מספר הדירה ארוך מדי',
  DELIVERY_LIMITS.apartment.raw,
)
  .transform(asciiDigits)
  .pipe(
    z.string().superRefine((value, ctx) => {
      const message =
        value === ''
          ? null
          : characterCount(value) > DELIVERY_LIMITS.apartment.max
            ? 'מספר הדירה ארוך מדי'
            : !APARTMENT_CHARACTERS.test(value)
              ? 'מספר הדירה מכיל תווים שאינם מותרים'
              : !STARTS_WITH_LETTER_OR_DIGIT.test(value)
                ? 'מספר הדירה חייב להתחיל באות או בספרה'
                : null
      if (message) ctx.addIssue({ code: 'custom', message })
    }),
  )

const POSTAL_CODE_INVALID = 'המיקוד חייב להכיל 7 ספרות'
/** An Israeli postal code: seven digits, none of them leading with 0. Only the shape is checked. */
export const POSTAL_CODE = /^[1-9]\d{6}$/
/** What may be written between the digits of a postal code: a space of any kind, or any dash. */
const POSTAL_CODE_SEPARATORS = /[\p{Zs}\p{Pd}]/gu

/**
 * A postal code as it is stored: the digits only. It takes out the invisible marks, spaces of any kind
 * and dashes (and nothing else: not a tab or a line break), and reads Arabic-Indic, Persian and
 * full-width digits as 0-9. What cannot be read as a code stays as it is, for the check; it is meant
 * for a value that `hasNonText` has found nothing wrong with, and `postalCodeField` asks first.
 */
export function normalizePostalCode(value: string): string {
  return asciiDigits(normalizeLine(value)).replace(POSTAL_CODE_SEPARATORS, '')
}

/**
 * The postal code, when there is one: seven digits, written with or without spaces or dashes in
 * them, stored as the seven digits. A code does not begin with 0, so `0000000` is not one.
 */
const postalCodeField = z
  .string()
  .max(DELIVERY_LIMITS.postalCode.raw, POSTAL_CODE_INVALID)
  .refine((value) => !hasNonText(value), POSTAL_CODE_INVALID)
  .transform(normalizePostalCode)
  .pipe(z.string().refine((value) => value === '' || POSTAL_CODE.test(value), POSTAL_CODE_INVALID))

const NOTES_NOT_ALLOWED = 'ההערות מכילות תווים שאינם מותרים'

/**
 * A note for the delivery: a few lines of any script, and emoji. It cannot hold a control or
 * direction character, `<` or `>`, nor begin with `=`, `+`, `-` or `@` (a formula in a
 * spreadsheet): a note is shown, and may be sent or exported, as it is.
 */
const notesField = z
  .string()
  .max(DELIVERY_LIMITS.notes.raw, 'ההערות ארוכות מדי (עד 300 תווים)')
  .refine((value) => !hasNonText(value, { allowLineBreaks: true }), NOTES_NOT_ALLOWED)
  .transform(normalizeLines)
  .pipe(
    z.string().superRefine((value, ctx) => {
      const message =
        characterCount(value) > DELIVERY_LIMITS.notes.max
          ? 'ההערות ארוכות מדי (עד 300 תווים)'
          : value.split('\n').length > DELIVERY_LIMITS.notes.maxLines
            ? 'יש עד 6 שורות בהערות'
            : /[<>]/.test(value)
              ? NOTES_NOT_ALLOWED
              : startsLikeFormula(value)
                ? 'ההערות לא יכולות להתחיל בסימן מיוחד'
                : null
      if (message) ctx.addIssue({ code: 'custom', message })
    }),
  )

export const deliveryDetailsSchema = z.object({
  fullName: nameField('שם מלא', DELIVERY_LIMITS.fullName),
  email: deliveryEmailField,
  phone: phoneField,
  city: nameField('עיר', DELIVERY_LIMITS.city),
  street: nameField('רחוב', DELIVERY_LIMITS.street),
  houseNumber: houseNumberField,
  apartment: apartmentField,
  postalCode: postalCodeField,
  notes: notesField,
})

export type DeliveryDetails = z.infer<typeof deliveryDetailsSchema>
