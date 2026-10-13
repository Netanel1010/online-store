import { deliveryDetailsSchema } from './delivery'

const valid = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '050-1234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  houseNumber: '12',
  apartment: '',
  postalCode: '',
  notes: '',
}

/** What the schema stores for one field, or what it says is wrong with it. */
function field(name: string, value: string) {
  const result = deliveryDetailsSchema.safeParse({ ...valid, [name]: value })
  const stored = result.success ? (result.data as Record<string, unknown>)[name] : undefined
  const problems = result.error?.issues
    .filter((issue) => issue.path[0] === name)
    .map((issue) => issue.message)
  return { ok: result.success, stored, problems: problems ?? [] }
}

describe('the house number', () => {
  it.each([
    '12',
    '1',
    '120',
    '12א',
    '12 א',
    "12א'",
    '12/4',
    '12-14',
    '12\u201314', // an en dash
    '12ב',
    '3B',
    '12.',
    '1234567890',
  ])('accepts %s', (value) => {
    expect(field('houseNumber', value).ok, value).toBe(true)
  })

  it.each(['ללא מספר', 'ללא', 'ללא  מספר'])(
    'accepts the words for an address that has no number: %s',
    (value) => {
      expect(field('houseNumber', value).ok, value).toBe(true)
    },
  )

  it('stores Arabic-Indic digits as 0-9 and the number tidied', () => {
    expect(field('houseNumber', '١٢').stored).toBe('12')
    expect(field('houseNumber', ' 12\u00A0א ').stored).toBe('12 א')
    expect(field('houseNumber', 'ללא  מספר').stored).toBe('ללא מספר')
  })

  it('asks for a number when there is none', () => {
    expect(field('houseNumber', '').problems).toEqual(['יש להזין מספר בית'])
    expect(field('houseNumber', '  \u200F ').problems).toEqual(['יש להזין מספר בית'])
  })

  it('accepts ten characters and rejects eleven', () => {
    expect(field('houseNumber', '1'.repeat(10)).ok).toBe(true)
    expect(field('houseNumber', '1'.repeat(11)).problems).toEqual(['מספר הבית ארוך מדי'])
    expect(field('houseNumber', '1'.repeat(600)).problems).toEqual(['מספר הבית ארוך מדי'])
  })

  it.each([
    ['zero', '0'],
    ['zeros', '00'],
    ['only punctuation', '!!!'],
    ['only letters, which are not a word for none', 'אבג'],
    ['another word', 'אין'],
    ['a formula', '=1+1'],
    ['a formula with a plus', '+1'],
    ['a formula with an at sign', '@1'],
    ['a leading hyphen', '-1'],
    ['a tag', '<1>'],
    ['a NUL', '1\u00002'],
    ['a tab', '1\t2'],
    ['a right-to-left override', '1\u202E2'],
    ['a semicolon', '1;2'],
  ])('rejects %s', (_name, value) => {
    expect(field('houseNumber', value).problems).toEqual(['מספר הבית אינו תקין'])
  })
})

describe('the apartment', () => {
  it('is not required', () => {
    expect(field('apartment', '').ok).toBe(true)
    expect(field('apartment', '   ').stored).toBe('')
  })

  it.each(['4', '4א', 'ב', "ב'", '12/3', 'קרקע', '3-4', 'A4'])('accepts %s', (value) => {
    expect(field('apartment', value).stored).toBe(value)
  })

  it('accepts ten characters and rejects eleven', () => {
    expect(field('apartment', '1'.repeat(10)).ok).toBe(true)
    expect(field('apartment', '1'.repeat(11)).problems).toEqual(['מספר הדירה ארוך מדי'])
  })

  it.each(['=1+1', '+1', '@A1', 'a|b', '<4>', '4;5', '4\t5', '1\u202E2', '1\u00002'])(
    'rejects %s',
    (value) => {
      expect(field('apartment', value).problems).toHaveLength(1)
    },
  )

  it('rejects a value that begins with a hyphen, a quote or a slash', () => {
    for (const value of ['-4', "'4", '"4', '/4']) {
      expect(field('apartment', value).problems, value).toEqual([
        'מספר הדירה חייב להתחיל באות או בספרה',
      ])
    }
  })
})

describe('the postal code', () => {
  it('is not required', () => {
    expect(field('postalCode', '').ok).toBe(true)
    expect(field('postalCode', '  ').stored).toBe('')
  })

  it.each([
    ['6436901', '6436901'],
    ['64-369-01', '6436901'],
    ['64 369 01', '6436901'],
    [' 6436901 ', '6436901'],
    ['\u200F6436901', '6436901'],
    ['٦٤٣٦٩٠١', '6436901'],
    ['9100000', '9100000'],
    ['1000000', '1000000'],
  ])('reads %j as %s', (typed, stored) => {
    expect(field('postalCode', typed).stored).toBe(stored)
  })

  it.each([
    ['six digits', '123456'],
    ['eight digits', '12345678'],
    ['the old five digits', '12345'],
    ['letters', 'abcdefg'],
    ['a letter among digits', '643690a'],
    ['all zeros', '0000000'],
    ['a leading zero', '0123456'],
    ['too long to be read', '1'.repeat(30)],
    ['a NUL', '64369\u000001'],
  ])('rejects %s', (_name, value) => {
    expect(field('postalCode', value).problems).toEqual(['המיקוד חייב להכיל 7 ספרות'])
  })
})

describe('the notes', () => {
  it('are not required', () => {
    expect(field('notes', '').ok).toBe(true)
    expect(field('notes', ' \n  \n').stored).toBe('')
  })

  it('keep Hebrew, Arabic, English, a mix of them and emoji', () => {
    for (const value of [
      'להשאיר ליד הדלת',
      'من فضلك اترك الطرد عند الباب',
      'Please leave it at the door',
      'צלצלו ל-050 לפני שמגיעים (Dana)',
      'תודה 🙏',
      'משפחה 👨\u200D👩\u200D👧',
    ]) {
      expect(field('notes', value).stored, value).toBe(value)
    }
  })

  it('keep their lines, up to six', () => {
    const six = ['1', '2', '3', '4', '5', '6'].map((n) => `שורה ${n}`).join('\n')
    expect(field('notes', six).stored).toBe(six)
    expect(field('notes', `${six}\nשורה 7`).problems).toEqual(['יש עד 6 שורות בהערות'])
  })

  it('store every kind of line break as one, and the lines tidied', () => {
    expect(field('notes', ' א \r\n  ב\rג ').stored).toBe('א\nב\nג')
  })

  it('accept 300 characters, counting a simple emoji as one, and reject 301', () => {
    expect(field('notes', 'א'.repeat(300)).ok).toBe(true)
    expect(field('notes', '🙏'.repeat(300)).ok).toBe(true)
    expect(field('notes', 'א'.repeat(301)).problems).toEqual(['ההערות ארוכות מדי (עד 300 תווים)'])
    expect(field('notes', 'א'.repeat(5000)).problems).toEqual(['ההערות ארוכות מדי (עד 300 תווים)'])
  })

  it.each([
    ['a NUL', 'א\u0000ב'],
    ['a tab', 'א\tב'],
    ['a delete', 'א\u007fב'],
    ['a line separator', 'א\u2028ב'],
    ['a right-to-left override', 'א\u202Eב'],
    ['an isolate', 'א\u2066ב'],
    ['an invisible separator', 'א\u2063ב'],
    ['a lone surrogate', 'א\ud800ב'],
    ['a tag', 'א <b>ב</b>'],
    ['a less-than sign', 'א < ב'],
    ['a greater-than sign', 'א > ב'],
    ['a script', '<script>alert(1)</script>'],
  ])('reject %s', (_name, value) => {
    expect(field('notes', value).problems).toEqual(['ההערות מכילות תווים שאינם מותרים'])
  })

  it.each([
    ['an equals sign', '=HYPERLINK("http://example.com")'],
    ['a plus', '+1+1'],
    ['a hyphen', '-2+3'],
    ['an at sign', '@SUM(1,2)'],
  ])('reject a note that begins with %s', (_name, value) => {
    expect(field('notes', value).problems).toEqual(['ההערות לא יכולות להתחיל בסימן מיוחד'])
  })

  it('accept a later line that begins with one: a cell starts at the first line', () => {
    expect(field('notes', 'שלום\n=1+1').ok).toBe(true)
  })

  it('accept an equals sign, a plus and a hyphen that are not at the start', () => {
    expect(field('notes', 'בבית 12 - קומה 3 + מעלית').ok).toBe(true)
    expect(field('notes', 'a=b').ok).toBe(true)
  })

  it('store what they stored again, unchanged', () => {
    for (const typed of [' א \r\n\u00A0ב\u200F ', 'Sine\u0301ad\n\n\nx']) {
      const once = field('notes', typed).stored as string
      expect(field('notes', once).stored).toBe(once)
    }
  })
})

describe('the whole delivery', () => {
  it('is read the same way again once it has been read', () => {
    const once = deliveryDetailsSchema.parse({
      fullName: '  נתנאל\u00A0\u200F כהן ',
      email: ' netanel@example.com\u200E',
      phone: '+972 (0) 50-123-4567',
      city: 'תל\u00A0אביב',
      street: 'דיזנגוף',
      houseNumber: '١٢ א',
      apartment: ' 4 ',
      postalCode: '64-369-01',
      notes: ' להשאיר \r\n ליד הדלת ',
    })

    expect(once).toEqual({
      fullName: 'נתנאל כהן',
      email: 'netanel@example.com',
      phone: '0501234567',
      city: 'תל אביב',
      street: 'דיזנגוף',
      houseNumber: '12 א',
      apartment: '4',
      postalCode: '6436901',
      notes: 'להשאיר\nליד הדלת',
    })
    expect(deliveryDetailsSchema.parse(once)).toEqual(once)
  })

  it('does not claim that an address exists: the messages only speak of the shape of a value', () => {
    const messages = Object.values(
      deliveryDetailsSchema
        .safeParse({
          ...valid,
          city: '<>',
          street: '1',
          houseNumber: '!',
          postalCode: '1',
          phone: '1',
        })
        .error?.issues.map((issue) => issue.message) ?? [],
    ).join(' ')

    expect(messages).not.toMatch(/קיימ|ניתן לשלוח|משלוח|נמצא/)
  })
})
