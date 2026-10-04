import { normalizePhone } from '@/lib/validation'
import { checkoutSchema } from './schema'

const valid = {
  fullName: 'נתנאל בבייב',
  email: 'netanel@example.com',
  phone: '050-1234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  houseNumber: '12',
  apartment: '',
  postalCode: '',
  notes: '',
  acceptDemo: true,
}

const messages = (input: Record<string, unknown>) =>
  checkoutSchema.safeParse(input).error?.issues.map((issue) => issue.message) ?? []

describe('checkoutSchema', () => {
  it('accepts valid details with the optional fields empty', () => {
    expect(checkoutSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts the optional fields when filled', () => {
    const result = checkoutSchema.safeParse({
      ...valid,
      apartment: '4א',
      postalCode: '6436901',
      notes: 'להשאיר ליד הדלת',
    })

    expect(result.success).toBe(true)
  })

  it('reports every missing required field', () => {
    const result = messages({
      ...valid,
      fullName: '',
      email: '',
      phone: '',
      city: '',
      street: '',
      houseNumber: '',
      acceptDemo: false,
    })

    expect(result).toEqual(
      expect.arrayContaining([
        'יש להזין שם מלא',
        'יש להזין כתובת אימייל',
        'יש להזין מספר טלפון',
        'יש להזין עיר',
        'יש להזין רחוב',
        'יש להזין מספר בית',
        'יש לאשר שזו הזמנת הדגמה',
      ]),
    )
  })

  it('treats whitespace-only text as missing', () => {
    expect(messages({ ...valid, city: '   ' })).toContain('יש להזין עיר')
  })

  it('rejects a malformed email', () => {
    expect(messages({ ...valid, email: 'netanel@' })).toContain('כתובת האימייל אינה תקינה')
  })

  it.each(['050-1234567', '0501234567', '03 123 4567', '+972501234567', '(03)1234567'])(
    'accepts the phone number %s',
    (phone) => {
      expect(checkoutSchema.safeParse({ ...valid, phone }).success).toBe(true)
    },
  )

  it.each(['12345', 'abc', '1234567890123', '+1 202 555 0100', '050-12'])(
    'rejects the phone number %s',
    (phone) => {
      expect(messages({ ...valid, phone })).toContain('מספר הטלפון אינו תקין')
    },
  )

  it.each(['123456', '12345678', 'abcdefg'])('rejects the postal code %s', (postalCode) => {
    expect(messages({ ...valid, postalCode })).toContain('המיקוד חייב להכיל 7 ספרות')
  })

  it('rejects too-long values', () => {
    expect(messages({ ...valid, houseNumber: '1'.repeat(11) })).toContain('מספר הבית ארוך מדי')
    expect(messages({ ...valid, notes: 'x'.repeat(301) })).toContain(
      'ההערות ארוכות מדי (עד 300 תווים)',
    )
  })

  it('requires the demo acknowledgement to be ticked', () => {
    expect(messages({ ...valid, acceptDemo: false })).toEqual(['יש לאשר שזו הזמנת הדגמה'])
  })
})

describe('normalizePhone', () => {
  it('removes separators and converts +972', () => {
    expect(normalizePhone('050-123 4567')).toBe('0501234567')
    expect(normalizePhone('+972501234567')).toBe('0501234567')
    expect(normalizePhone('(03) 123-4567')).toBe('031234567')
  })
})
