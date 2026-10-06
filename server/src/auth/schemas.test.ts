import { describe, expect, it } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
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
