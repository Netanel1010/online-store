import {
  PASSWORDS_THAT_ARE_ACCEPTED,
  PASSWORDS_THAT_ARE_NOT_THE_EMAIL,
  PASSWORDS_THAT_ARE_REFUSED,
  PASSWORDS_THAT_ARE_THE_EMAIL,
} from '@/test/passwordCases'
import { passwordProblem } from './passwordPolicy'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizePassword,
  passwordIsEmail,
  passwordLength,
  passwordTooLong,
  passwordTooShort,
} from './rules'

const chr = (code: number) => String.fromCharCode(code)

describe('passwordProblem: what a new password has to be', () => {
  it('is 8 to 128 characters', () => {
    expect([PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH]).toEqual([8, 128])
  })

  it.each(PASSWORDS_THAT_ARE_ACCEPTED)('accepts %s', (_what, password) => {
    expect(passwordProblem(password)).toBeNull()
  })

  it.each(PASSWORDS_THAT_ARE_REFUSED)('refuses %s', (_what, password, problem) => {
    expect(passwordProblem(password)).toBe(problem)
  })

  it('calls an empty password too short', () => {
    expect(passwordProblem('')).toBe('too-short')
  })

  it('has no rule about letters, digits or symbols', () => {
    // Each of these is refused before only because it lacked a letter or a digit.
    for (const password of ['zebraquilt', '48291035', '[]{}<>|~', 'אבגדהוזח']) {
      expect(passwordProblem(password)).toBeNull()
    }
  })

  it('gives the first reason, in the order: too short, too long, not well formed, common', () => {
    // A lone surrogate in a password that is too short: too short.
    expect(passwordProblem(`ab${chr(0xd800)}`)).toBe('too-short')
    // A lone surrogate in a password that is too long: too long.
    expect(passwordProblem(`${'a'.repeat(128)}${chr(0xd800)}`)).toBe('too-long')
    // A lone surrogate in one that is just right is refused for that.
    expect(passwordProblem(`${'a'.repeat(8)}${chr(0xd800)}`)).toBe('malformed')
  })
})

describe('the length of a password: as it was typed and as it is hashed (NFKC)', () => {
  const decomposed = 'e' + chr(0x301)

  it('counts a character outside the basic plane once', () => {
    const emoji = String.fromCodePoint(0x1f600)

    expect(passwordTooShort(emoji.repeat(8))).toBe(false)
    expect(passwordTooShort(emoji.repeat(7))).toBe(true)
    expect(passwordTooLong(emoji.repeat(128))).toBe(false)
    expect(passwordTooLong(emoji.repeat(129))).toBe(true)
  })

  it('is too short when NFKC makes it short, however long it was typed', () => {
    expect(passwordTooShort(decomposed.repeat(7))).toBe(true)
    expect(passwordTooShort(decomposed.repeat(8))).toBe(false)
  })

  it('is too short when it was typed short, however long NFKC makes it', () => {
    // One character that NFKC writes as eighteen. What is typed is what a person has to remember and
    // what an attacker has to guess, so the minimum is on it as well.
    expect(passwordTooShort(chr(0xfdfa))).toBe(true)
    expect(passwordTooShort(chr(0xfb03).repeat(7))).toBe(true)
  })

  it('is too long when NFKC makes it long, however short it was typed', () => {
    expect(passwordTooLong(chr(0xfb03).repeat(42) + 'ab')).toBe(false)
    expect(passwordTooLong(chr(0xfb03).repeat(43))).toBe(true)
  })

  it('is too long when it was typed long, even if NFKC makes it short', () => {
    // 130 code points typed, 65 once NFKC has composed them: the limit on the input still refuses it.
    expect(passwordLength(decomposed.repeat(65))).toBe(130)
    expect(passwordLength(normalizePassword(decomposed.repeat(65)))).toBe(65)
    expect(passwordTooLong(decomposed.repeat(65))).toBe(true)
    expect(passwordProblem(decomposed.repeat(65))).toBe('too-long')
    // 128 typed (64 once composed) is the longest that is accepted.
    expect(passwordTooLong(decomposed.repeat(64))).toBe(false)
  })
})

describe('passwordIsEmail', () => {
  it.each(PASSWORDS_THAT_ARE_THE_EMAIL)('is true for %s', (_what, password, email) => {
    expect(passwordIsEmail(password, email)).toBe(true)
  })

  it.each(PASSWORDS_THAT_ARE_NOT_THE_EMAIL)(
    'is false for %s: the password is not trimmed',
    (_what, password, email) => {
      expect(passwordIsEmail(password, email)).toBe(false)
    },
  )
})
