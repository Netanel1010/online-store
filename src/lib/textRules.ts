// No imports and no `@` alias: the API (server/) imports the checkout schema, and through it this
// file, as Node ES modules.

/**
 * What a typed or pasted value goes through before it is checked and stored, and what it may not
 * hold. Text copied from a Hebrew or Arabic page often carries marks that nobody sees (a direction
 * mark, a zero-width space): those are dropped, because they mean nothing in a form value and a
 * rejection the visitor cannot see the reason for is worse than no check. What can do harm (control
 * characters, the characters that reorder text, a formula in a spreadsheet cell) is rejected.
 *
 * **Order.** A value is first looked at as it was typed (`hasNonText`), and only a value that holds
 * nothing prohibited is normalized. Normalizing is never what makes a prohibited character go away
 * before it is looked for: all it removes is the marks below, spaces, the blank lines around a note,
 * and the separators that a field names for itself. Nothing here uses `trim()` or `\s`, which also
 * remove tabs, line breaks and the line and paragraph separators.
 *
 * This is a check of the shape of a value. It does not say that an address exists or can be
 * delivered to; nothing here knows that.
 */

/**
 * Zero-width space, left-to-right mark, right-to-left mark, Arabic letter mark, word joiner and the
 * byte order mark. They do not show, and a copy from a right-to-left page brings them along.
 */
const HARMLESS_INVISIBLE = /[\u061C\u200B\u200E\u200F\u2060\uFEFF]/g

/** Any kind of space (no-break, thin, ideographic, ...) as one ordinary space. */
const SPACE_RUNS = /\p{Zs}+/gu

/**
 * Characters that are not text: the control characters (a NUL, a tab, a line break), the line and
 * paragraph separators, every invisible format character (among them the ones that make text
 * display in another order than it is stored, U+202A to U+202E and U+2066 to U+2069), lone
 * surrogates and private-use characters. The joiners U+200C and U+200D are not among them: Persian,
 * Arabic and emoji need them.
 */
const NOT_TEXT = /[\p{Cc}\p{Zl}\p{Zp}\p{Cf}\p{Cs}\p{Co}]/u
const JOINERS = /[\u200C\u200D]/g

/** The first character that makes a spreadsheet read a cell as a formula. */
const FORMULA_START = /^[=+\-@]/

const ARABIC_AND_FULLWIDTH_DIGITS = /[\u0660-\u0669\u06F0-\u06F9\uFF10-\uFF19]/g

/** The number of characters a person sees (an emoji is one), not UTF-16 units. */
export function characterCount(value: string): number {
  return Array.from(value).length
}

/** Drops what is in the text without showing (see `HARMLESS_INVISIBLE`). */
export function stripInvisible(value: string): string {
  return value.replace(HARMLESS_INVISIBLE, '')
}

/** Collapses every run of spaces (of any kind) to one space and removes the one at either end. */
function tidySpaces(value: string): string {
  return value.replace(SPACE_RUNS, ' ').replace(/^ | $/g, '')
}

/**
 * A one-line value as it is stored: the invisible marks dropped, composed to the usual form (the
 * same Hebrew word is the same bytes however it was typed), every kind of space one space, and no
 * space at either end. Only spaces are removed there, never a tab or a line break: call it on a
 * value that `hasNonText` has found nothing wrong with. Applying it again changes nothing.
 */
export function normalizeLine(value: string): string {
  return tidySpaces(stripInvisible(value).normalize('NFC'))
}

/**
 * A multi-line value as it is stored: like `normalizeLine` for each line, every kind of line break
 * (`\r\n`, `\r`, `\n`) as `\n`, and no blank line before the first line or after the last. Those
 * blank lines are the only line breaks that this removes. Applying it again changes nothing.
 */
export function normalizeLines(value: string): string {
  return stripInvisible(value)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(tidySpaces)
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

/** Arabic-Indic, Persian and full-width digits as 0-9, as they are typed on some keyboards. */
export function asciiDigits(value: string): string {
  return value.replace(ARABIC_AND_FULLWIDTH_DIGITS, (digit) => {
    const code = digit.charCodeAt(0)
    const zero = code >= 0xff10 ? 0xff10 : code >= 0x06f0 ? 0x06f0 : 0x0660
    return String(code - zero)
  })
}

/**
 * Whether the text holds something that is not text (see `NOT_TEXT`). Ask it of the value **as it
 * was typed**, before `normalizeLine` or `normalizeLines`. The invisible marks that normalizing drops
 * and the joiners are not "something": a copy from a right-to-left page is read, not refused. A line
 * break (`\n` or `\r`) is something unless `allowLineBreaks`.
 */
export function hasNonText(value: string, { allowLineBreaks = false } = {}): boolean {
  const withoutMarks = stripInvisible(value).replace(JOINERS, '')
  return NOT_TEXT.test(allowLineBreaks ? withoutMarks.replace(/[\n\r]/g, '') : withoutMarks)
}

/** Whether a spreadsheet would read the value as a formula: it starts with `=`, `+`, `-` or `@`. */
export function startsLikeFormula(value: string): boolean {
  return FORMULA_START.test(value)
}
