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
