import { describe, expect, it } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
import {
  NAMES_THAT_ARE_KEPT,
  NAMES_THAT_ARE_TIDIED,
  NAME_WITH,
  NOT_TEXT_IN_A_NAME,
} from '../../../src/test/nameCases.ts'
import { parseLoginBody, parseRegisterBody } from './schemas.ts'

const failure = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return error
  }
}
const invalid = (run: () => unknown) => {
  const error = failure(run)
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ status: 400, code: 'invalid_input' })
  return error as HttpError
}

const good = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }

describe('parseRegisterBody', () => {
  it('accepts a valid registration', () => {
    expect(parseRegisterBody(good)).toEqual(good)
  })

  it('trims the name, and trims and lower-cases the email', () => {
    expect(
      parseRegisterBody({ ...good, name: '  Dana  ', email: '  Dana@Example.COM ' }),
    ).toMatchObject({ name: 'Dana', email: 'dana@example.com' })
  })

  it('does not change the password in any way', () => {
    expect(parseRegisterBody({ ...good, password: '  Spaces 1 around  ' }).password).toBe(
      '  Spaces 1 around  ',
    )
  })

  it('ignores fields it does not know, such as an attempt to set an id or a role', () => {
    expect(parseRegisterBody({ ...good, id: 'x', role: 'admin', isAdmin: true })).toEqual(good)
  })

  it.each([
    ['no body', undefined],
    ['null', null],
    ['a list', [good]],
    ['text', 'name=a'],
    ['an empty object', {}],
  ])('rejects %s', (_name, body) => {
    invalid(() => parseRegisterBody(body))
  })

  it.each([
    ['a missing name', { ...good, name: undefined }],
    ['a name that is too short', { ...good, name: 'a' }],
    ['a blank name', { ...good, name: '   ' }],
    ['a name that is too long', { ...good, name: 'a'.repeat(61) }],
    ['a name that is not text', { ...good, name: { $ne: '' } }],
    ['a missing email', { ...good, email: undefined }],
    ['a malformed email', { ...good, email: 'not-an-email' }],
    ['an email without a domain', { ...good, email: 'a@' }],
    ['an email that is too long', { ...good, email: `${'a'.repeat(250)}@b.co` }],
    ['an email that is not text', { ...good, email: ['a@b.co'] }],
    ['a missing password', { ...good, password: undefined }],
    ['a password that is too short', { ...good, password: 'Ab1' }],
    ['a password without a digit', { ...good, password: 'OnlyLetters' }],
    ['a password without a letter', { ...good, password: '12345678' }],
    ['a password that is too long', { ...good, password: `A1${'a'.repeat(127)}` }],
    ['a password that is not text', { ...good, password: 12345678 }],
  ])('rejects %s', (_name, body) => {
    invalid(() => parseRegisterBody(body))
  })

  it('accepts a password of exactly 8 and exactly 128 characters', () => {
    parseRegisterBody({ ...good, password: 'Abcdefg1' })
    parseRegisterBody({ ...good, password: `A1${'a'.repeat(126)}` })
  })

  it('names the field that is wrong, and never repeats what was sent', () => {
    const error = invalid(() => parseRegisterBody({ ...good, password: 'short1' }))

    expect(error.message).toContain('password')
    expect(error.message).not.toContain('short1')
  })
})

describe('parseLoginBody', () => {
  it('accepts an email and a password, and normalizes the email', () => {
    expect(parseLoginBody({ email: ' Dana@Example.com ', password: 'x' })).toEqual({
      email: 'dana@example.com',
      password: 'x',
    })
  })

  it('does not apply the rules for new passwords: an older password still has to be accepted', () => {
    expect(parseLoginBody({ email: 'a@b.co', password: 'short' }).password).toBe('short')
  })

  it.each([
    ['no body', undefined],
    ['an empty password', { email: 'a@b.co', password: '' }],
    ['a missing password', { email: 'a@b.co' }],
    ['a malformed email', { email: 'nope', password: 'x' }],
    ['a missing email', { password: 'x' }],
    ['a password over the limit', { email: 'a@b.co', password: 'a'.repeat(129) }],
    ['an operator instead of a password', { email: 'a@b.co', password: { $ne: '' } }],
    ['an operator instead of an email', { email: { $ne: '' }, password: 'x' }],
  ])('rejects %s', (_name, body) => {
    invalid(() => parseLoginBody(body))
  })
})

const chr = (code: number) => String.fromCharCode(code)

describe('the name of an account', () => {
  const refused = NOT_TEXT_IN_A_NAME.flatMap(([label, char]) =>
    Object.entries(NAME_WITH).map(
      ([where, make]) => [`${label} ${where}`, make(char)] as [string, string],
    ),
  )
  const nameOf = (name: string) => parseRegisterBody({ ...good, name }).name

  it.each(refused)('refuses a name with %s, instead of trimming or keeping it', (_where, name) => {
    const error = invalid(() => parseRegisterBody({ ...good, name }))

    // It names the field and nothing that was sent.
    expect(error.message).toBe('The field "name" is not valid')
    expect(error.message).not.toContain('נתנאל')
  })

  it.each(NAMES_THAT_ARE_TIDIED)('reads %s', (_what, typed, stored) => {
    expect(nameOf(typed)).toBe(stored)
    // Reading what was stored changes nothing.
    expect(nameOf(stored)).toBe(stored)
  })

  it.each(NAMES_THAT_ARE_KEPT)('keeps %s as it was typed', (_what, name) => {
    expect(nameOf(name)).toBe(name)
  })

  it('keeps the limits: 2 to 60 characters, counted once the name is read', () => {
    expect(nameOf('אב')).toBe('אב')
    expect(nameOf('א'.repeat(60))).toBe('א'.repeat(60))
    expect(nameOf(`${chr(0xa0)}${'א'.repeat(60)}${chr(0xa0)}`)).toBe('א'.repeat(60))
    invalid(() => parseRegisterBody({ ...good, name: 'א' }))
    invalid(() => parseRegisterBody({ ...good, name: 'א'.repeat(61) }))
    // The limit counts letters, not the halves that a character outside the basic plane is written in.
    const emoji = String.fromCodePoint(0x1f600)
    expect(nameOf(emoji.repeat(60))).toBe(emoji.repeat(60))
    invalid(() => parseRegisterBody({ ...good, name: emoji.repeat(61) }))
    // Nothing is left of a name that was only spaces and invisible marks.
    invalid(() => parseRegisterBody({ ...good, name: `  ${chr(0x200b)}${chr(0xa0)} ` }))
  })
})

describe('the email of an account: what it accepts is as it was, and what is stored is clean', () => {
  // The characters that `trim()` takes off the ends of an address; the address is clean afterwards.
  const TRIMMED_OFF = [
    ['TAB', chr(0x09)],
    ['LF', chr(0x0a)],
    ['VT', chr(0x0b)],
    ['FF', chr(0x0c)],
    ['CR', chr(0x0d)],
    ['NBSP', chr(0xa0)],
    ['line separator', chr(0x2028)],
    ['paragraph separator', chr(0x2029)],
    ['BOM', chr(0xfeff)],
    ['space', ' '],
  ] as const
  // Everything else that is not text is no part of an address: it is refused at the ends too.
  const NOT_TRIMMED_OFF = [
    ...NOT_TEXT_IN_A_NAME.filter(
      ([label]) => !['TAB', 'LF', 'VT', 'FF', 'CR'].includes(label) && !label.includes('separator'),
    ),
    ['ZWSP', chr(0x200b)],
    ['LRM', chr(0x200e)],
  ] as const

  it.each(TRIMMED_OFF)('register: %s around the address is dropped', (_label, char) => {
    expect(parseRegisterBody({ ...good, email: `${char} Netanel@Example.COM ${char}` }).email).toBe(
      'netanel@example.com',
    )
  })

  it.each(TRIMMED_OFF)('sign-in: %s around the address is dropped', (_label, char) => {
    expect(
      parseLoginBody({ email: `${char}Netanel@Example.COM${char}`, password: 'x' }).email,
    ).toBe('netanel@example.com')
  })

  it.each(NOT_TRIMMED_OFF)('%s around the address is refused', (_label, char) => {
    invalid(() => parseRegisterBody({ ...good, email: `${char}netanel@example.com${char}` }))
    invalid(() => parseLoginBody({ email: `${char}netanel@example.com${char}`, password: 'x' }))
  })

  it.each([...TRIMMED_OFF, ...NOT_TRIMMED_OFF].filter(([label]) => label !== 'space'))(
    '%s inside the address is refused, in the part before the @ and after it',
    (_label, char) => {
      for (const email of [`net${char}anel@example.com`, `netanel@exa${char}mple.com`]) {
        invalid(() => parseRegisterBody({ ...good, email }))
        invalid(() => parseLoginBody({ email, password: 'x' }))
      }
    },
  )
})
