/**
 * Passwords for the tests of the rules for a new password, written once so that the rules themselves, the
 * registration form and the API are all tried with the same ones (and `passwordAgreement.test.ts` checks
 * that the form and the API answer alike). The unusual characters are made from their numbers: a
 * character that cannot be seen, or that is half of a pair, is no good in the text of a test.
 */
// Relative, with the extension, because the API's tests import this file too.
import type { PasswordProblem } from '../features/auth/passwordPolicy.ts'

const chr = (code: number) => String.fromCharCode(code)
const EMOJI = String.fromCodePoint(0x1f512)
/** "e" followed by this is an "é" that NFKC writes as one character. */
const ACUTE = chr(0x301)

/** The same text in fullwidth letters, as a Japanese keyboard writes it. NFKC makes it plain again. */
export const toFullwidth = (text: string) =>
  [...text]
    .map((c) => (c > ' ' && c <= '~' ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c))
    .join('')

export type AcceptedPassword = readonly [what: string, password: string]
export type RefusedPassword = readonly [what: string, password: string, problem: PasswordProblem]

/** Passwords that are accepted: there is no rule about what a password is made of. */
export const PASSWORDS_THAT_ARE_ACCEPTED: AcceptedPassword[] = [
  ['letters and digits', 'Passw0rdOK'],
  ['letters only', 'zebraquilt'],
  ['digits only', '48291035'],
  ['symbols only', '[]{}<>|~'],
  ['Hebrew letters only', 'אבגדהוזח'],
  ['Hebrew letters and digits', 'סיסמה1234'],
  ['a phrase with spaces', 'correct horse battery staple'],
  ['spaces around it, which are part of it', '  Spaces 1 around  '],
  ['emoji only', EMOJI.repeat(8)],
  ['emoji among letters', `ab${EMOJI}${EMOJI}cd12`],
  ['exactly 8 characters', 'Xyzwvut1'],
  ['exactly 128 characters', `A1${'a'.repeat(126)}`],
  ['128 emoji, which are 256 units of UTF-16', EMOJI.repeat(128)],
  ['letters with a decomposed accent, 8 once NFKC has written them', ('e' + ACUTE).repeat(8)],
  ['44 characters that NFKC makes 128', chr(0xfb03).repeat(42) + 'ab'],
  ['the replacement character, which is a character like another', `abcdefg${chr(0xfffd)}`],
  ['a common password with something added', 'password1!'],
  ['a common password with a space before it', ' password1'],
  ['a common password with a space after it', 'password1 '],
  ['a common password inside a longer one', 'mypassword1'],
]

/** Passwords that are refused, and why. */
export const PASSWORDS_THAT_ARE_REFUSED: RefusedPassword[] = [
  ['seven characters', 'Abcdef1', 'too-short'],
  ['seven Hebrew letters', 'אבגדהוז', 'too-short'],
  ['seven emoji', EMOJI.repeat(7), 'too-short'],
  ['8 characters that NFKC makes 4', ('e' + ACUTE).repeat(4), 'too-short'],
  ['14 characters that NFKC makes 7', ('e' + ACUTE).repeat(7), 'too-short'],
  ['one character that NFKC writes as 18', chr(0xfdfa), 'too-short'],
  ['129 characters', `A1${'a'.repeat(127)}`, 'too-long'],
  ['129 emoji', EMOJI.repeat(129), 'too-long'],
  ['43 characters that NFKC makes 129', chr(0xfb03).repeat(43), 'too-long'],
  ['130 characters that NFKC makes 65', ('e' + ACUTE).repeat(65), 'too-long'],
  ['a lone high surrogate at the end', `abcdefg${chr(0xd800)}`, 'malformed'],
  ['a lone low surrogate at the start', `${chr(0xdc00)}abcdefgh`, 'malformed'],
  ['a lone surrogate in the middle', `abcd${chr(0xd83d)}efgh`, 'malformed'],
  ['a low surrogate in front of a high one', `abcd${chr(0xde00)}${chr(0xd83d)}efgh`, 'malformed'],
  ['a common password', 'password1', 'common'],
  ['a common password in capitals', 'PASSWORD1', 'common'],
  ['a common password with some capitals', 'PassWord1', 'common'],
  ['a common password in fullwidth letters', toFullwidth('password1'), 'common'],
  ['a common password in fullwidth capitals', toFullwidth('PASSWORD1'), 'common'],
  ['a common password of digits', '12345678', 'common'],
  ['a common keyboard walk', 'qwertyui', 'common'],
]

export type PasswordAndEmail = readonly [what: string, password: string, email: string]

const ADDRESS = 'dana@example.com'

/** A password that is the address of the account, as the address is compared. */
export const PASSWORDS_THAT_ARE_THE_EMAIL: PasswordAndEmail[] = [
  ['the address', ADDRESS, ADDRESS],
  ['the address in capitals', ADDRESS.toUpperCase(), ADDRESS],
  ['the address, which the account has in other capitals', ADDRESS, 'Dana@Example.COM'],
  ['the address, which was typed with spaces around it', ADDRESS, `  ${ADDRESS} `],
  ['the address in fullwidth letters', toFullwidth(ADDRESS), ADDRESS],
]

/** Passwords that are close to the address and are not it: the password is not trimmed. */
export const PASSWORDS_THAT_ARE_NOT_THE_EMAIL: PasswordAndEmail[] = [
  ['the address with a space before it', ` ${ADDRESS}`, ADDRESS],
  ['the address with a space after it', `${ADDRESS} `, ADDRESS],
  ['the address with something added', `${ADDRESS}1`, ADDRESS],
  ['the address of another account', 'noa.levi@example.com', ADDRESS],
  ['the part before the @, of an address long enough', 'danadanadana', 'danadanadana@example.com'],
  ['the part after the @', 'example.com', ADDRESS],
]
