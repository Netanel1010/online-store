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

describe('the delivery email', () => {
  it.each([
    'netanel@example.com',
    'first.last@example.co.il',
    'name+shop@example.com',
    'x@sub.domain.example.org',
  ])('accepts %s', (email) => {
    expect(field('email', email).ok).toBe(true)
  })

  it('does not store a direction mark that a copy from a right-to-left page brings', () => {
    expect(field('email', '\u200Fnetanel@example.com\u200E').stored).toBe('netanel@example.com')
    expect(field('email', 'netanel\u200B@example.com').stored).toBe('netanel@example.com')
  })

  const address = (length: number) => {
    // 64 + 1 + 63 + 1 + 63 + 1 + k + 4 = 197 + k
    const k = length - 197
    return `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(k)}.com`
  }

  it('accepts the longest address there can be and no longer one', () => {
    expect(address(254)).toHaveLength(254)
    expect(field('email', address(254)).ok).toBe(true)
    expect(field('email', address(255)).problems).toEqual(['כתובת האימייל ארוכה מדי'])
  })

  it('limits the part before the @ to 64 characters', () => {
    expect(field('email', `${'a'.repeat(64)}@example.com`).ok).toBe(true)
    expect(field('email', `${'a'.repeat(65)}@example.com`).problems).toEqual([
      'כתובת האימייל ארוכה מדי',
    ])
  })

  it('does not read a value that is far too long', () => {
    expect(field('email', `${'a'.repeat(600)}@example.com`).problems).toEqual([
      'כתובת האימייל ארוכה מדי',
    ])
  })

  it.each([
    ['a missing @', 'netanel.example.com'],
    ['a missing domain', 'netanel@'],
    ['a space', 'net anel@example.com'],
    ['a NUL', 'net\u0000anel@example.com'],
    ['a right-to-left override', 'net\u202Eanel@example.com'],
    ['two addresses', 'a@example.com, b@example.com'],
    ['a name with it', 'Net <netanel@example.com>'],
    ['a leading plus (a formula in a spreadsheet)', '+netanel@example.com'],
    ['a leading hyphen (a formula in a spreadsheet)', '-netanel@example.com'],
  ])('rejects %s', (_name, email) => {
    expect(field('email', email).problems).toEqual(['כתובת האימייל אינה תקינה'])
  })

  it('asks for an address when there is none', () => {
    expect(field('email', '').problems).toEqual(['יש להזין כתובת אימייל'])
    expect(field('email', '\u200F').problems).toEqual(['יש להזין כתובת אימייל'])
  })
})

describe.each([
  ['fullName', 'שם מלא', 80],
  ['city', 'עיר', 60],
  ['street', 'רחוב', 80],
] as const)('the %s', (name, label, max) => {
  it('keeps Hebrew, Arabic, English and a mix of them as they are typed', () => {
    for (const value of ['נתנאל כהן', 'محمد أحمد', 'Dana Levi', 'שדרות Rothschild', 'אנה Smith']) {
      expect(field(name, value).stored, value).toBe(value)
    }
  })

  it('accepts a value of the longest length and rejects one character more', () => {
    expect(field(name, 'א'.repeat(max)).ok).toBe(true)
    expect(field(name, 'א'.repeat(max + 1)).problems).toEqual([`${label} ארוך מדי`])
  })

  it('does not read a value that is far too long', () => {
    expect(field(name, 'א'.repeat(5000)).problems).toEqual([`${label} ארוך מדי`])
  })

  it('asks for a value when there is none', () => {
    expect(field(name, '').problems).toEqual([`יש להזין ${label}`])
    expect(field(name, '   \u00A0 \u200F').problems).toEqual([`יש להזין ${label}`])
  })

  it('rejects a single character', () => {
    expect(field(name, 'א').problems).toEqual([`${label} קצר מדי`])
  })

  it('stores the tidied value: one space between words, no invisible marks', () => {
    expect(field(name, '  נתנאל\u00A0\u00A0 כהן  ').stored).toBe('נתנאל כהן')
    expect(field(name, 'נתנאל\u200F כהן\u200E').stored).toBe('נתנאל כהן')
    expect(field(name, 'נתנאל\u200Bכהן').stored).toBe('נתנאלכהן')
  })

  it('stores a word typed with its marks apart the same as one typed composed', () => {
    expect(field(name, 'Sine\u0301ad').stored).toBe('Sinéad')
  })

  it('stores what it stored again, unchanged', () => {
    for (const typed of ['  נתנאל\u00A0\u00A0 כהן  ', 'Sine\u0301ad\u200F', 'ר\u200Bמת-גן']) {
      const once = field(name, typed).stored as string
      expect(field(name, once).stored).toBe(once)
    }
  })

  it.each([
    ['a NUL', 'נתנאל\u0000כהן'],
    ['a tab', 'נתנאל\tכהן'],
    ['a line break', 'נתנאל\nכהן'],
    ['a carriage return', 'נתנאל\rכהן'],
    ['a delete', 'נתנאל\u007fכהן'],
    ['a line separator', 'נתנאל\u2028כהן'],
    ['a right-to-left override', 'abc\u202Egpj.exe'],
    ['a left-to-right override', 'abc\u202Dgpj.exe'],
    ['an embedding', 'abc\u202Agpj.exe'],
    ['an isolate', 'abc\u2066gpj.exe'],
    ['an invisible separator', 'abc\u2063def'],
    ['a tag', '<script>alert(1)</script>'],
    ['a pipe', 'abc|def'],
    ['a semicolon', 'abc;def'],
    ['a brace', 'abc{{x}}def'],
    ['an equals sign', 'abc=def'],
    ['a backslash', 'abc\\def'],
    ['an emoji', 'נתנאל 🙏'],
    ['a formula', "=cmd|' /C calc'!A0"],
    ['a formula with an at sign', '@SUM(1,2)'],
  ])('rejects %s', (_name, value) => {
    expect(field(name, value).problems).toEqual([`${label} מכיל תווים שאינם מותרים`])
  })

  it.each([
    ['a plus', '+1+1 ok'],
    ['a hyphen', '-נתנאל'],
    ['a quote', '"נתנאל"'],
    ['an apostrophe', "'נתנאל"],
    ['a bracket', '(נתנאל)'],
    ['a dot', '.נתנאל'],
  ])('rejects a value that starts with %s', (_name, value) => {
    const { problems } = field(name, value)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/מכיל תווים שאינם מותרים|חייב להתחיל באות או בספרה/)
  })

  it('rejects a value that has no letter in it', () => {
    expect(field(name, '12345').problems).toEqual([`${label} חייב להכיל אותיות`])
  })
})

describe('places and people that are really there', () => {
  it.each([
    'תל אביב - יפו',
    'באר שבע',
    'קריית אונו',
    'ראשל"צ',
    'פ"ת',
    'פרדס חנה-כרכור',
    'פרדס חנה־כרכור',
    'מגדל העמק',
    'קיבוץ מעגן מיכאל',
    "ג'ת",
    'נוף הגליל',
    'Tel Aviv-Yafo',
    "St. John's",
    'حيفا',
    'الناصرة',
    'ירושלים (מזרח)',
  ])('accepts the city %s', (city) => {
    expect(field('city', city).stored).toBe(city)
  })

  it.each([
    'שדרות רוטשילד',
    'דרך מנחם בגין',
    'הרצל',
    "ז'בוטינסקי",
    'האצ"ל',
    'שמעון בן שטח',
    'רחוב 7',
    'שדרות ירושלים 12',
    'דרך חברון / הנשיא',
    'Rothschild Blvd.',
    'Allenby',
    'شارع الملك فيصل',
    'אבן גבירול (צפון)',
  ])('accepts the street %s', (street) => {
    expect(field('street', street).stored).toBe(street)
  })

  it.each([
    "Sinéad O'Brien",
    "ג'ורג' בוש",
    'בן־גוריון',
    'מרים אבו-סעדה',
    'محمد أحمد',
    'Dr. Dana Levi',
  ])('accepts the name %s', (name) => {
    expect(field('fullName', name).stored).toBe(name)
  })
})
