import {
  NAMES_THAT_ARE_KEPT,
  NAMES_THAT_ARE_TIDIED,
  NAME_WITH,
  NOT_TEXT_IN_A_NAME,
} from '@/test/nameCases'
import { loginSchema, registerSchema } from './schemas'

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? []

const validRegistration = {
  name: 'נתנאל',
  email: 'netanel@example.com',
  password: 'Passw0rdOK',
  confirmPassword: 'Passw0rdOK',
}

describe('loginSchema', () => {
  it('accepts an email and a password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true)
  })

  it('requires an email and a password', () => {
    const result = loginSchema.safeParse({ email: '  ', password: '' })

    expect(messages(result)).toEqual(['יש להזין כתובת אימייל', 'יש להזין סיסמה'])
  })

  it('rejects an invalid email', () => {
    expect(messages(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }))).toEqual([
      'כתובת האימייל אינה תקינה',
    ])
  })

  it('trims the email', () => {
    expect(loginSchema.parse({ email: '  a@b.co ', password: 'x' }).email).toBe('a@b.co')
  })
})

describe('registerSchema', () => {
  it('accepts valid details', () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true)
  })

  it('requires a name of at least two characters', () => {
    expect(messages(registerSchema.safeParse({ ...validRegistration, name: '' }))).toContain(
      'יש להזין שם',
    )
    expect(messages(registerSchema.safeParse({ ...validRegistration, name: 'א' }))).toContain(
      'שם קצר מדי',
    )
    expect(
      messages(registerSchema.safeParse({ ...validRegistration, name: 'א'.repeat(61) })),
    ).toContain('שם ארוך מדי')
  })

  it('rejects an invalid email', () => {
    expect(messages(registerSchema.safeParse({ ...validRegistration, email: 'a@' }))).toContain(
      'כתובת האימייל אינה תקינה',
    )
  })

  it.each([
    ['too short', 'Ab1', 'הסיסמה חייבת להכיל לפחות 8 תווים'],
    ['without a letter', '12345678', 'הסיסמה חייבת להכיל לפחות אות אחת'],
    ['without a digit', 'abcdefgh', 'הסיסמה חייבת להכיל לפחות ספרה אחת'],
  ])('rejects a password that is %s', (_label, password, message) => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      password,
      confirmPassword: password,
    })

    expect(messages(result)).toContain(message)
  })

  it('accepts Hebrew letters as the required letter', () => {
    const password = 'סיסמה1234'

    expect(
      registerSchema.safeParse({ ...validRegistration, password, confirmPassword: password })
        .success,
    ).toBe(true)
  })

  it('requires the confirmation to match, and reports it on the confirmation field', () => {
    const result = registerSchema.safeParse({ ...validRegistration, confirmPassword: 'Different1' })

    expect(result.success).toBe(false)
    const issue = result.error?.issues.find((i) => i.message === 'הסיסמאות אינן תואמות')
    expect(issue?.path).toEqual(['confirmPassword'])
  })
})

describe('the name in the registration form', () => {
  const NOT_ALLOWED = 'שם מכיל תווים שאינם מותרים'
  const refused = NOT_TEXT_IN_A_NAME.flatMap(([label, char]) =>
    Object.entries(NAME_WITH).map(
      ([where, make]) => [`${label} ${where}`, make(char)] as [string, string],
    ),
  )
  const parse = (name: string) => registerSchema.safeParse({ ...validRegistration, name })

  it.each(refused)(
    'refuses a name with %s, with the one message, instead of trimming or keeping it',
    (_where, name) => {
      const result = parse(name)

      expect(result.success).toBe(false)
      expect(messages(result)).toEqual([NOT_ALLOWED])
    },
  )

  it('puts the message on the name field', () => {
    const result = parse(NAME_WITH.inTheMiddle(NOT_TEXT_IN_A_NAME[0]![1]))

    expect(result.error?.issues[0]?.path).toEqual(['name'])
  })

  it.each(NAMES_THAT_ARE_TIDIED)('reads %s', (_what, typed, stored) => {
    const result = parse(typed)

    expect(result.success).toBe(true)
    expect(result.data?.name).toBe(stored)
  })

  it.each(NAMES_THAT_ARE_KEPT)('keeps %s as it was typed', (_what, name) => {
    expect(parse(name).data?.name).toBe(name)
  })

  it('keeps the messages for a name that is missing, too short or too long', () => {
    expect(messages(parse(''))).toContain('יש להזין שם')
    expect(messages(parse(`  ${String.fromCharCode(0x200b)} `))).toContain('יש להזין שם')
    expect(messages(parse('א'))).toContain('שם קצר מדי')
    expect(messages(parse('א'.repeat(61)))).toContain('שם ארוך מדי')
    expect(parse('א'.repeat(60)).success).toBe(true)
  })
})

describe('the email in the forms: what it accepts is as it was', () => {
  const TAB = String.fromCharCode(9)
  const LF = String.fromCharCode(10)
  const NBSP = String.fromCharCode(0xa0)

  it.each([
    ['a trailing line break', `netanel@example.com${LF}`],
    ['a leading tab', `${TAB}netanel@example.com`],
    ['no-break spaces around it', `${NBSP}netanel@example.com${NBSP}`],
    ['spaces around it', '  netanel@example.com '],
  ])('signs in with %s: the address is trimmed', (_what, email) => {
    expect(loginSchema.parse({ email, password: 'x' }).email).toBe('netanel@example.com')
    expect(registerSchema.parse({ ...validRegistration, email }).email).toBe('netanel@example.com')
  })

  it.each([
    ['a tab', `net${TAB}anel@example.com`],
    ['a line break', `netanel@exa${LF}mple.com`],
    ['a no-break space', `net${NBSP}anel@example.com`],
  ])('refuses %s inside the address', (_what, email) => {
    expect(messages(loginSchema.safeParse({ email, password: 'x' }))).toEqual([
      'כתובת האימייל אינה תקינה',
    ])
    expect(messages(registerSchema.safeParse({ ...validRegistration, email }))).toContain(
      'כתובת האימייל אינה תקינה',
    )
  })
})
