import { deliveryDetailsSchema } from './delivery'

/**
 * A control character must be refused wherever it is: in the middle of a value, at the start and at
 * the end. The values are normalized (spaces tidied, separators removed), and normalizing must never
 * be what makes a control character go away before it is looked for. Each field is tried with each
 * character at each place, so that no field and no place is left to chance.
 */

const valid = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '050-1234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  houseNumber: '12',
  apartment: '4',
  postalCode: '6436901',
  notes: 'להשאיר ליד הדלת',
}

/** What each field says when it holds a character that is not allowed. */
const refusal: Record<keyof typeof valid, string> = {
  fullName: 'שם מלא מכיל תווים שאינם מותרים',
  email: 'כתובת האימייל אינה תקינה',
  phone: 'מספר הטלפון אינו תקין',
  city: 'עיר מכיל תווים שאינם מותרים',
  street: 'רחוב מכיל תווים שאינם מותרים',
  houseNumber: 'מספר הבית אינו תקין',
  apartment: 'מספר הדירה מכיל תווים שאינם מותרים',
  postalCode: 'המיקוד חייב להכיל 7 ספרות',
  notes: 'ההערות מכילות תווים שאינם מותרים',
}

const controls: [string, string][] = [
  ['a tab', '\t'],
  ['a line feed', '\n'],
  ['a carriage return', '\r'],
  ['a vertical tab', '\u000b'],
  ['a form feed', '\u000c'],
  ['a next line', '\u0085'],
  ['a line separator', '\u2028'],
  ['a paragraph separator', '\u2029'],
  ['a NUL', '\u0000'],
  ['an escape', '\u001b'],
  ['a delete', '\u007f'],
  ['a C1 control', '\u009f'],
]

/** The line breaks that the notes (and only the notes) are written with. */
const isLineBreak = (character: string) => character === '\n' || character === '\r'

function check(field: keyof typeof valid, value: string) {
  const result = deliveryDetailsSchema.safeParse({ ...valid, [field]: value })
  return {
    ok: result.success,
    problems: result.error?.issues.filter((i) => i.path[0] === field).map((i) => i.message) ?? [],
    stored: result.success ? (result.data as Record<string, string>)[field] : undefined,
  }
}

/** The valid value with the character put in the middle (after its first character), at the start, at the end. */
function placed(field: keyof typeof valid, character: string) {
  const [first = '', ...rest] = Array.from(valid[field])
  return {
    'in the middle': `${first}${character}${rest.join('')}`,
    'at the start': `${character}${valid[field]}`,
    'at the end': `${valid[field]}${character}`,
  }
}

describe.each(Object.keys(valid) as (keyof typeof valid)[])('the %s', (field) => {
  it('is accepted as it is, so that the cases below differ only by the character', () => {
    expect(check(field, valid[field]).ok).toBe(true)
  })

  describe.each(controls)('with %s', (_name, character) => {
    // The notes are written in lines: a line break is theirs, and the blank lines around them are tidied.
    const supported = field === 'notes' && isLineBreak(character)

    it.each(Object.entries(placed(field, character)))('refuses it %s', (where, value) => {
      if (supported) {
        expect(check(field, value).ok, where).toBe(true)
        return
      }
      const { ok, problems } = check(field, value)
      expect(ok, where).toBe(false)
      expect(problems, where).toEqual([refusal[field]])
    })
  })
})

describe('what a number is normalized with', () => {
  it.each([
    ['a space', '050 1234567'],
    ['a no-break space', '050\u00A01234567'],
    ['a thin space', '050\u20091234567'],
    ['a hyphen', '050-1234567'],
    ['a non-breaking hyphen', '050\u20111234567'],
    ['an en dash', '050\u20131234567'],
    ['a maqaf', '050־1234567'],
    ['a dot', '050.1234567'],
    ['brackets', '(050)1234567'],
    ['a left-to-right mark', '050\u200E1234567'],
    ['a right-to-left mark', '050\u200F1234567'],
    ['a zero-width space', '050\u200B1234567'],
    ['an Arabic letter mark', '050\u061C1234567'],
    ['a word joiner', '050\u20601234567'],
    ['a byte order mark', '\uFEFF050-1234567'],
  ])('still removes %s', (_name, phone) => {
    expect(check('phone', phone).stored).toBe('0501234567')
  })

  it.each([
    ['a space', '64 369 01'],
    ['a no-break space', '64\u00A0369\u00A001'],
    ['a hyphen', '64-369-01'],
    ['an en dash', '64\u2013369\u201301'],
    ['a right-to-left mark', '\u200F6436901\u200E'],
  ])('still removes %s from a postal code', (_name, postalCode) => {
    expect(check('postalCode', postalCode).stored).toBe('6436901')
  })

  it.each([
    '050/1234567',
    '050_1234567',
    '050,1234567',
    '050:1234567',
    '050*1234567',
    '050#1234567',
  ])('does not remove anything else: %s is not a number', (phone) => {
    expect(check('phone', phone).problems).toEqual(['מספר הטלפון אינו תקין'])
  })

  it.each(['64/369/01', '64_369_01', '64,369,01', '64.369.01'])(
    'does not remove anything else from a postal code: %s is not one',
    (postalCode) => {
      expect(check('postalCode', postalCode).problems).toEqual(['המיקוד חייב להכיל 7 ספרות'])
    },
  )
})

describe('what is tidied around a value', () => {
  it('removes spaces around a one-line value, and only spaces', () => {
    expect(check('fullName', '  נתנאל כהן\u00A0 ').stored).toBe('נתנאל כהן')
    expect(check('email', ' netanel@example.com\u00A0').stored).toBe('netanel@example.com')
    expect(check('houseNumber', ' 12 ').stored).toBe('12')
    expect(check('apartment', '\u00A04\u00A0').stored).toBe('4')
    expect(check('postalCode', ' 6436901 ').stored).toBe('6436901')
    expect(check('phone', ' 050-1234567 ').stored).toBe('0501234567')
  })

  it('removes blank lines around the notes and spaces around each line, nothing else', () => {
    expect(check('notes', '\n\r\n  א  \r\n  ב \n\n').stored).toBe('א\nב')
  })
})
