import { normalizePassword, passwordIsWellFormed, passwordKey, passwordLength } from './rules'

const chr = (code: number) => String.fromCharCode(code)
const HIGH = chr(0xd83d)
const LOW = chr(0xde00)
const EMOJI = HIGH + LOW
// The language's own answer, to hold the check to (its type is in a newer library than the project's).
const nativelyWellFormed = (text: string) =>
  (text as unknown as { isWellFormed(): boolean }).isWellFormed()

describe('passwordLength', () => {
  it.each([
    ['nothing', '', 0],
    ['letters', 'abcdefgh', 8],
    ['Hebrew', 'סיסמה123', 8],
    ['an emoji, which is one character and two UTF-16 units', EMOJI, 1],
    ['emoji among letters', `ab${EMOJI}${EMOJI}cd`, 6],
    ['spaces', '        ', 8],
  ])('counts %s in code points', (_what, password, length) => {
    expect(passwordLength(password)).toBe(length)
  })

  it('does not normalize: the length of what was typed', () => {
    // "e" and a combining acute accent are two code points, which NFKC makes one.
    expect(passwordLength(`e${chr(0x301)}`)).toBe(2)
    expect(passwordLength(normalizePassword(`e${chr(0x301)}`))).toBe(1)
  })
})

describe('normalizePassword and passwordKey', () => {
  it('is what the API hashes: NFKC', () => {
    const fullwidth = 'ｐａｓｓｗｏｒｄ１'

    expect(normalizePassword(fullwidth)).toBe('password1')
    expect(normalizePassword('ﬁ')).toBe('fi')
  })

  it('compares in NFKC and in lower case', () => {
    expect(passwordKey('PassWord1')).toBe('password1')
    expect(passwordKey('ＰＡＳＳＷＯＲＤ１')).toBe('password1')
  })

  it('never trims, because a space is part of a password', () => {
    expect(passwordKey('  Password1 ')).toBe('  password1 ')
  })

  it('leaves Hebrew and emoji alone', () => {
    expect(passwordKey('סיסמה-🔒')).toBe('סיסמה-🔒')
  })
})

describe('passwordIsWellFormed', () => {
  it.each([
    ['nothing', ''],
    ['ASCII', 'Passw0rdOK'],
    ['Hebrew', 'סיסמה1234'],
    ['an emoji, a pair of surrogates in the right order', `ab${EMOJI}cd`],
    ['two emoji', EMOJI + EMOJI],
    ['U+FFFD, the character that a lone surrogate is turned into', `abc${chr(0xfffd)}`],
    ['the last unit before the surrogates and the first after them', chr(0xd7ff) + chr(0xe000)],
  ])('accepts %s', (_what, password) => {
    expect(passwordIsWellFormed(password)).toBe(true)
  })

  it.each([
    ['a lone high surrogate', chr(0xd800)],
    ['a lone low surrogate', chr(0xdc00)],
    ['the last low surrogate', chr(0xdfff)],
    ['a high surrogate at the end', `abcdefg${HIGH}`],
    ['a low surrogate at the start', `${LOW}abcdefg`],
    ['a low surrogate before a high one', LOW + HIGH],
    ['two high surrogates in a row', HIGH + HIGH],
    ['a high surrogate in front of a letter', `${HIGH}a${LOW}`],
    ['a pair, then a lone low surrogate', EMOJI + LOW],
    ['a lone high surrogate in the middle', `abcd${chr(0xd800)}efgh`],
  ])('refuses %s', (_what, password) => {
    expect(passwordIsWellFormed(password)).toBe(false)
  })

  it('agrees with the language on every unit and on every pair of units', () => {
    // The check is written by hand because `isWellFormed` is newer than the browsers that are supported;
    // this holds it to what the language says.
    const units = [0x41, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xfffd]
    for (const a of units) {
      expect(passwordIsWellFormed(chr(a))).toBe(nativelyWellFormed(chr(a)))
      for (const b of units) {
        const text = chr(a) + chr(b)
        expect(passwordIsWellFormed(text)).toBe(nativelyWellFormed(text))
        for (const c of units) {
          const longer = text + chr(c)
          expect(passwordIsWellFormed(longer)).toBe(nativelyWellFormed(longer))
        }
      }
    }
  })
})
