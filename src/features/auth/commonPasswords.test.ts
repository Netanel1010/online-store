import { isCommonPassword } from './commonPasswords'
import { COMMON_PASSWORDS } from './commonPasswords.data'
import dataSource from './commonPasswords.data.ts?raw'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordIsWellFormed,
  passwordKey,
  passwordLength,
} from './rules'

describe('the list of common passwords', () => {
  it('has a few thousand entries, and says how many in its header', () => {
    expect(COMMON_PASSWORDS.length).toBeGreaterThan(1500)
    expect(COMMON_PASSWORDS.length).toBeLessThan(5000)
    expect(dataSource).toContain(`${COMMON_PASSWORDS.length} entries are left of the 10000`)
  })

  it('is sorted and has no entry twice', () => {
    for (let i = 1; i < COMMON_PASSWORDS.length; i++) {
      expect(COMMON_PASSWORDS[i - 1]! < COMMON_PASSWORDS[i]!).toBe(true)
    }
  })

  it('has only entries that are written as a password is compared, and that could be chosen', () => {
    const wrong = COMMON_PASSWORDS.filter(
      (entry) =>
        passwordKey(entry) !== entry ||
        !passwordIsWellFormed(entry) ||
        passwordLength(entry) < PASSWORD_MIN_LENGTH ||
        passwordLength(entry) > PASSWORD_MAX_LENGTH,
    )

    expect(wrong).toEqual([])
  })

  it('has the passwords that everyone knows', () => {
    for (const password of ['password', 'password1', '12345678', 'qwertyui', 'abcdefg1']) {
      expect(COMMON_PASSWORDS).toContain(password)
    }
  })

  it('does not have an entry shorter than a new password can be', () => {
    expect(COMMON_PASSWORDS).not.toContain('123456')
    expect(COMMON_PASSWORDS).not.toContain('qwerty')
  })
})

describe('the header of the data file, which says whose the list is and under which licence', () => {
  const header = dataSource.slice(0, dataSource.indexOf('*/') + 2)

  it('is a comment that a minifier keeps, so that it travels with the list into the build', () => {
    expect(header.startsWith('/*!')).toBe(true)
  })

  it('names the author of the list, the page it was published on and its licence', () => {
    expect(header).toContain('Mark Burnett (xato.net)')
    expect(header).toContain('https://xato.net/passwords/more-top-worst-passwords/')
    expect(header).toContain('Creative Commons Attribution-ShareAlike 3.0 Unported')
    expect(header).toContain('https://creativecommons.org/licenses/by-sa/3.0/')
  })

  it('says it is an adaptation, what was changed, and that the licence is this file only', () => {
    expect(header).toContain('adaptation')
    expect(header).toContain('Changes made to the list')
    expect(header).toContain('not the licence of the rest of this repository (MIT')
    expect(header).toContain('THIRD_PARTY_NOTICES.md')
  })

  it('names where the list was taken from, and the exact revision', () => {
    expect(header).toContain('https://github.com/danielmiessler/SecLists')
    expect(header).toContain('a3416ba7062a1bc2ec6b0fe76eac7ee16c80521b')
    expect(header).toContain('c03abe883df8a88b7ead0a97b9862937ea6266de')
  })
})

describe('isCommonPassword', () => {
  it.each([
    ['a common password', 'password1'],
    ['in capitals', 'PASSWORD1'],
    ['with some capitals', 'PassWord1'],
    ['written in fullwidth letters', 'ｐａｓｓｗｏｒｄ１'],
    ['written in fullwidth capitals', 'ＰＡＳＳＷＯＲＤ１'],
    ['only digits', '12345678'],
  ])('is true for %s', (_what, password) => {
    expect(isCommonPassword(password)).toBe(true)
  })

  it.each([
    ['one that contains a common password', 'mypassword1'],
    ['one that begins with a common password', 'password1!'],
    ['one that ends with a common password', 'xxx12345678'],
    ['with a space before it', ' password1'],
    ['with a space after it', 'password1 '],
    ['with a space inside it', 'pass word1'],
    ['a password that is not common', 'Passw0rdOK'],
    ['Hebrew', 'סיסמה1234'],
    ['nothing', ''],
  ])(
    'is false for %s: only the whole password is compared, and it is not trimmed',
    (_what, password) => {
      expect(isCommonPassword(password)).toBe(false)
    },
  )

  it('does not change with the order it is asked in (the list is read once)', () => {
    expect(isCommonPassword('Passw0rdOK')).toBe(false)
    expect(isCommonPassword('password1')).toBe(true)
    expect(isCommonPassword('Passw0rdOK')).toBe(false)
  })
})
