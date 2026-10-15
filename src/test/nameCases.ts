/**
 * The characters that an account name is tested against, in one place so that the form, the API and the
 * test that compares them (`src/features/auth/nameAgreement.test.ts`) all read the same list. They are
 * written with `String.fromCharCode`, never as escapes inside a string, so that nothing in the tooling
 * can turn them into the characters themselves.
 *
 * No imports: the API's tests (server/) use this file as well.
 */
const chr = (code: number) => String.fromCharCode(code)

/**
 * What is not text (`hasNonText`): the control characters, the line and paragraph separators, the
 * invisible format characters that reorder text or are not meant to be typed (among them the tag
 * characters that a subdivision flag emoji is written with), a lone surrogate and a private-use
 * character. A name that holds one is refused, wherever in the name it is.
 */
export const NOT_TEXT_IN_A_NAME: readonly (readonly [label: string, char: string])[] = [
  ['TAB', chr(0x09)],
  ['LF', chr(0x0a)],
  ['VT', chr(0x0b)],
  ['FF', chr(0x0c)],
  ['CR', chr(0x0d)],
  ['NUL', chr(0x00)],
  ['SOH', chr(0x01)],
  ['ESC', chr(0x1b)],
  ['DEL', chr(0x7f)],
  ['NEL U+0085', chr(0x85)],
  ['APC U+009F', chr(0x9f)],
  ['soft hyphen U+00AD', chr(0xad)],
  ['line separator U+2028', chr(0x2028)],
  ['paragraph separator U+2029', chr(0x2029)],
  ['LRE U+202A', chr(0x202a)],
  ['RLE U+202B', chr(0x202b)],
  ['PDF U+202C', chr(0x202c)],
  ['LRO U+202D', chr(0x202d)],
  ['RLO U+202E', chr(0x202e)],
  ['LRI U+2066', chr(0x2066)],
  ['RLI U+2067', chr(0x2067)],
  ['FSI U+2068', chr(0x2068)],
  ['PDI U+2069', chr(0x2069)],
  ['private use U+E000', chr(0xe000)],
  ['lone surrogate U+D800', chr(0xd800)],
  ['tag character U+E0067', String.fromCodePoint(0xe0067)],
]

/** Where in a name the character is put: it is refused in each of them. */
export const NAME_WITH = {
  atTheStart: (char: string) => `${char}נתנאל כהן`,
  atTheEnd: (char: string) => `נתנאל כהן${char}`,
  inTheMiddle: (char: string) => `נתנאל${char}כהן`,
  atBothEnds: (char: string) => `${char}נתנאל כהן${char}`,
} as const

const NBSP = chr(0xa0)
const ZWSP = chr(0x200b)
const LRM = chr(0x200e)
const RLM = chr(0x200f)
const BOM = chr(0xfeff)
const EM_SPACE = chr(0x2003)
const IDEOGRAPHIC_SPACE = chr(0x3000)

/**
 * Names that are read, not refused: what they are stored as follows the rules the delivery details
 * follow (`normalizeLine`): the invisible marks of a right-to-left copy are dropped, every kind of space
 * is one space, no space at either end, and the name is composed (NFC).
 */
export const NAMES_THAT_ARE_TIDIED: readonly (readonly [
  label: string,
  typed: string,
  stored: string,
])[] = [
  ['spaces at both ends', '  נתנאל כהן  ', 'נתנאל כהן'],
  ['a no-break space at both ends', `${NBSP}נתנאל כהן${NBSP}`, 'נתנאל כהן'],
  ['a no-break space between the words', `נתנאל${NBSP}כהן`, 'נתנאל כהן'],
  [
    'an em space and an ideographic space between the words',
    `נתנאל${EM_SPACE}${IDEOGRAPHIC_SPACE}כהן`,
    'נתנאל כהן',
  ],
  ['several spaces between the words', 'נתנאל     כהן', 'נתנאל כהן'],
  ['a zero-width space inside a word', `נתנאל${ZWSP}כהן`, 'נתנאלכהן'],
  ['a zero-width space at both ends', `${ZWSP}נתנאל כהן${ZWSP}`, 'נתנאל כהן'],
  ['a left-to-right mark at the end', `נתנאל כהן${LRM}`, 'נתנאל כהן'],
  ['a right-to-left mark at the start', `${RLM}נתנאל כהן`, 'נתנאל כהן'],
  ['a byte order mark at the start', `${BOM}נתנאל כהן`, 'נתנאל כהן'],
  ['a byte order mark inside a word', `נתנאל${BOM}כהן`, 'נתנאלכהן'],
  [
    'a letter and its accent typed apart (composed to one)',
    `Rene${chr(0x301)} Cohen`,
    `Ren${chr(0xe9)} Cohen`,
  ],
]

/**
 * Names that are accepted exactly as typed, and that the checkout accepts as the name of the person it
 * is for too, so that an account made with one of them has a name the checkout can start with.
 */
export const NAMES_THE_CHECKOUT_ACCEPTS: readonly (readonly [label: string, name: string])[] = [
  ['Hebrew', 'נתנאל כהן'],
  ['Hebrew with a geresh', "ג'ק כהן"],
  ['Hebrew with gershayim', 'צה"ל כהן'],
  ['Hebrew with niqqud', 'שָׁלוֹם כהן'],
  ['a hyphen', 'בן-דוד'],
  ['a Latin apostrophe', "Dana O'Brien"],
  ['a Latin hyphen', 'Jean-Luc Picard'],
  ['Arabic', 'محمد علي'],
  ['Persian with a zero-width non-joiner', `می${chr(0x200c)}خواهم`],
  ['digits', 'דנה 2'],
]

/**
 * Names that are accepted exactly as typed by an account (there is no list of letters that a name may be
 * made of) and not by the checkout, which has one. That is how it was and is not part of this change.
 */
export const NAMES_ONLY_AN_ACCOUNT_ACCEPTS: readonly (readonly [label: string, name: string])[] = [
  ['an emoji', '😀 דנה'],
  [
    'an emoji family joined with zero-width joiners',
    `${chr(0xd83d)}${chr(0xdc68)}${chr(0x200d)}${chr(0xd83d)}${chr(0xdc69)} דנה`,
  ],
]

/** Every name that is accepted exactly as typed. */
export const NAMES_THAT_ARE_KEPT: readonly (readonly [label: string, name: string])[] = [
  ...NAMES_THE_CHECKOUT_ACCEPTS,
  ...NAMES_ONLY_AN_ACCOUNT_ACCEPTS,
]
