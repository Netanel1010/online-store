import { normalizePhone, phoneField, requiredText } from './validation'

const parse = (value: string) => phoneField.safeParse(value)
const message = (value: string) => parse(value).error?.issues[0]?.message

describe('normalizePhone', () => {
  it.each([
    ['050-1234567', '0501234567'],
    ['050 123 4567', '0501234567'],
    ['050.123.4567', '0501234567'],
    ['(050) 123-4567', '0501234567'],
    ['+972501234567', '0501234567'],
    ['+972-50-123-4567', '0501234567'],
    ['+972 50 123 4567', '0501234567'],
    ['972501234567', '0501234567'],
    ['00972501234567', '0501234567'],
    ['00972-50-1234567', '0501234567'],
    ['+972 (0) 50-123-4567', '0501234567'],
    ['+9720501234567', '0501234567'],
    ['03-1234567', '031234567'],
    ['(03) 123 4567', '031234567'],
    ['+972-3-1234567', '031234567'],
    ['\u200F050-1234567\u200E', '0501234567'],
    ['050\u200F-1234567', '0501234567'],
    ['٠٥٠١٢٣٤٥٦٧', '0501234567'],
    ['۰۵۰۱۲۳۴۵۶۷', '0501234567'],
    ['050\u20111234567', '0501234567'], // a non-breaking hyphen
    ['050\u20131234567', '0501234567'], // an en dash
    ['050\u00A01234567', '0501234567'], // a no-break space
    ['  050-1234567  ', '0501234567'],
  ])('reads %j as %s', (typed, stored) => {
    expect(normalizePhone(typed)).toBe(stored)
  })

  it('does not change a number it already changed', () => {
    for (const typed of ['+972 (0) 50-123-4567', '\u200F03-1234567', '00972721234567', 'abc']) {
      const once = normalizePhone(typed)
      expect(normalizePhone(once)).toBe(once)
    }
  })

  it('leaves what cannot be read as a number for the check', () => {
    expect(normalizePhone('abc')).toBe('abc')
    expect(normalizePhone('+1 202 555 0100')).toBe('+12025550100')
  })
})

describe('phoneField', () => {
  it.each([
    ['a mobile number', '0501234567'],
    ['a mobile number with a hyphen', '054-7654321'],
    ['a mobile number abroad style', '+972 52 765 4321'],
    ['a Tel Aviv landline', '03-5551234'],
    ['a Jerusalem landline', '02-6251234'],
    ['a Haifa landline', '04-8651234'],
    ['a Beer Sheva landline', '08-6251234'],
    ['a Sharon landline', '09-7651234'],
    ['an internet number', '072-2123456'],
    ['an internet number of 077', '077-1234567'],
  ])('accepts %s', (_name, typed) => {
    expect(parse(typed).success).toBe(true)
  })

  it('stores the number the way it is written locally', () => {
    expect(parse('+972-50-123-4567').data).toBe('0501234567')
    expect(parse('(03) 555 1234').data).toBe('035551234')
  })

  it.each([
    ['all zeros, nine of them', '000000000'],
    ['all zeros, ten of them', '0000000000'],
    ['a prefix that does not exist (01)', '0123456789'],
    ['a prefix that does not exist (06)', '0612345678'],
    ['a mobile number with a digit missing', '050123456'],
    ['a mobile number with a digit too many', '05012345678'],
    ['a landline with a digit too many', '031234567890'],
    ['a landline with a digit missing', '03123456'],
    ['an 1-800 number', '1-800-123-456'],
    ['a short code', '*2345'],
    ['a number of the United States', '+1 202 555 0100'],
    ['a number of the United Kingdom', '+44 20 7946 0958'],
    ['letters', 'abcdefghij'],
    ['letters among the digits', '050-12a4567'],
    ['a plus sign in the middle', '050+1234567'],
    ['too few digits', '050-12'],
    ['an extension', '050-1234567 ext 12'],
    ['two numbers', '050-1234567, 052-7654321'],
  ])('rejects %s', (_name, typed) => {
    expect(message(typed)).toBe('מספר הטלפון אינו תקין')
  })

  it('asks for a number when there is none, not for a valid one', () => {
    expect(message('')).toBe('יש להזין מספר טלפון')
    expect(message('   ')).toBe('יש להזין מספר טלפון')
    expect(message('\u200F \u200E')).toBe('יש להזין מספר טלפון')
  })

  it('rejects a number written with a lot of separators before reading it', () => {
    expect(message(`050${'-'.repeat(1000)}1234567`)).toBe('מספר הטלפון אינו תקין')
    expect(message(`0 5 0 1 2 3 4 5 6 7${' '.repeat(500)}`)).toBe('מספר הטלפון אינו תקין')
  })

  it('accepts the longest way of writing a number that people use', () => {
    const typed = '+972 (0) 50-123-4567'
    expect(typed.length).toBeLessThanOrEqual(30)
    expect(parse(typed).data).toBe('0501234567')
  })

  it('rejects control characters among the digits', () => {
    expect(parse('050\u00001234567').success).toBe(false)
    expect(parse('050\u202E1234567').success).toBe(false)
  })

  it.each([
    ['a tab', '\t'],
    ['a line feed', '\n'],
    ['a carriage return', '\r'],
    ['a vertical tab', '\u000b'],
    ['a form feed', '\u000c'],
    ['a next line', '\u0085'],
    ['a line separator', '\u2028'],
    ['a paragraph separator', '\u2029'],
    ['a NUL', '\u0000'],
    ['a right-to-left override', '\u202e'],
  ])(
    'rejects %s, among the digits, at the start and at the end, and does not remove it',
    (_name, character) => {
      for (const typed of [
        `050${character}1234567`,
        `${character}050-1234567`,
        `050-1234567${character}`,
        `+972${character}50-123-4567`,
      ]) {
        expect(message(typed), JSON.stringify(typed)).toBe('מספר הטלפון אינו תקין')
      }
    },
  )

  it('removes only the separators that it names', () => {
    expect(normalizePhone('050\t1234567')).toBe('050\t1234567')
    expect(normalizePhone('050\n1234567')).toBe('050\n1234567')
    expect(normalizePhone('050\u20281234567')).toBe('050\u20281234567')
    expect(normalizePhone('050/1234567')).toBe('050/1234567')
  })
})

describe('requiredText', () => {
  const NOT_ALLOWED = 'שם מכיל תווים שאינם מותרים'
  const field = requiredText('שם', { min: 2, max: 60 })
  const TAB = String.fromCharCode(0x09)
  const messages = (value: string) => field.safeParse(value).error?.issues.map((i) => i.message)

  it('looks at the value as it was typed, before it is tidied: a tab at the end is refused, not trimmed', () => {
    expect(messages(`נתנאל כהן${TAB}`)).toEqual([NOT_ALLOWED])
    expect(messages(`${TAB}נתנאל כהן`)).toEqual([NOT_ALLOWED])
  })

  it('says the label of the field in the message', () => {
    expect(
      requiredText('כינוי', { min: 2, max: 60 }).safeParse(`אב${TAB}גד`).error?.issues[0]?.message,
    ).toBe('כינוי מכיל תווים שאינם מותרים')
  })

  it('tidies what it accepts, as the delivery details do', () => {
    expect(
      field.parse(`  Rene${String.fromCharCode(0x301)}   Cohen${String.fromCharCode(0xa0)}`),
    ).toBe(`Ren${String.fromCharCode(0xe9)} Cohen`)
  })

  it('counts the length of what is left once it is tidied', () => {
    expect(field.safeParse(`${'א'.repeat(60)}${String.fromCharCode(0x200b)}`).success).toBe(true)
    expect(messages('א'.repeat(61))).toEqual(['שם ארוך מדי'])
    expect(messages('א')).toEqual(['שם קצר מדי'])
    expect(messages('')).toEqual(['יש להזין שם', 'שם קצר מדי'])
  })
})
