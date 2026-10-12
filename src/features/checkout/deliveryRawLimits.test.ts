import { characterCount } from '@/lib/textRules'
import { DELIVERY_LIMITS, deliveryDetailsSchema } from './delivery'

/**
 * The raw limit of a field (the longest value that is read at all, as it was typed) is counted in
 * Unicode code points, like every other limit and like JSON Schema counts `maxLength`. A letter or an
 * emoji outside the Basic Multilingual Plane is one code point and two UTF-16 units, so a value that
 * is within the limit in code points can be over it in units. These cases pin the difference.
 */

/** DESERET CAPITAL LETTER LONG I: a letter (\p{L}) outside the Basic Multilingual Plane. */
const astral = String.fromCodePoint(0x10400)

const valid = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '0501234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  houseNumber: '12',
  apartment: '4',
  postalCode: '6436901',
  notes: 'שלום',
}

function read(field: keyof typeof valid, value: string) {
  const result = deliveryDetailsSchema.safeParse({ ...valid, [field]: value })
  return {
    ok: result.success,
    stored: result.success ? (result.data as Record<string, string>)[field] : undefined,
    problems: result.error?.issues.filter((i) => i.path[0] === field).map((i) => i.message) ?? [],
  }
}

const padTo = (core: string, length: number) => core + ' '.repeat(length - characterCount(core))

describe('a raw limit counts code points, not UTF-16 units', () => {
  it('has the premise of the cases below: the values differ in the two counts', () => {
    const value = padTo(astral.repeat(80), 500)
    expect(characterCount(value)).toBe(500)
    expect(value.length).toBe(580)
  })

  it.each([
    ['fullName', astral.repeat(80), 'שם מלא ארוך מדי'],
    ['city', astral.repeat(60), 'עיר ארוך מדי'],
    ['street', astral.repeat(80), 'רחוב ארוך מדי'],
    ['houseNumber', `1${astral.repeat(9)}`, 'מספר הבית ארוך מדי'],
    ['apartment', astral.repeat(10), 'מספר הדירה ארוך מדי'],
  ] as const)(
    'reads a %s of supplementary-plane letters that is 500 code points as typed, and not one more',
    (field, core, tooLong) => {
      const atTheLimit = padTo(core, DELIVERY_LIMITS[field].raw)
      expect(atTheLimit.length).toBeGreaterThan(DELIVERY_LIMITS[field].raw)
      expect(read(field, atTheLimit).ok).toBe(true)
      expect(read(field, atTheLimit).stored).toBe(core)

      expect(read(field, `${atTheLimit} `).problems).toEqual([tooLong])
    },
  )

  it('reads notes of supplementary-plane emoji that are 2,000 code points as typed, and not one more', () => {
    const core = '🙏'.repeat(300)
    const atTheLimit = padTo(core, DELIVERY_LIMITS.notes.raw)
    expect(atTheLimit.length).toBe(2300)
    expect(read('notes', atTheLimit).ok).toBe(true)
    expect(read('notes', atTheLimit).stored).toBe(core)
    expect(read('notes', `${atTheLimit} `).problems).toEqual(['ההערות ארוכות מדי (עד 300 תווים)'])
  })

  it('refuses a value that is over the normalized limit however it is padded, with the message of that limit', () => {
    expect(read('fullName', astral.repeat(81)).problems).toEqual(['שם מלא ארוך מדי'])
    expect(read('fullName', padTo(astral.repeat(81), 500)).problems).toEqual(['שם מלא ארוך מדי'])
    expect(read('notes', '🙏'.repeat(301)).problems).toEqual(['ההערות ארוכות מדי (עד 300 תווים)'])
  })

  it.each([
    ['phone', '0501234567'],
    ['postalCode', '6436901'],
    ['email', 'netanel@example.com'],
  ] as const)(
    'reads a %s padded with spaces up to its raw limit, and not one more',
    (field, core) => {
      const atTheLimit = padTo(core, DELIVERY_LIMITS[field].raw)
      expect(read(field, atTheLimit).ok).toBe(true)
      expect(read(field, `${atTheLimit} `).ok).toBe(false)
    },
  )

  it('does not let a supplementary-plane character stand in for a separator of a number', () => {
    // Over the raw limit of 30 only in UTF-16 units: it is refused for what it is, not for its length.
    expect(read('phone', `050${astral}1234567`).problems).toEqual(['מספר הטלפון אינו תקין'])
    expect(read('postalCode', `64${astral}36901`).problems).toEqual(['המיקוד חייב להכיל 7 ספרות'])
  })
})
