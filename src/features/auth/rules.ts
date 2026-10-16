/**
 * The rules for an account's name, email and password, in one place because the form and the API
 * must agree on them: the form checks them to help the visitor (with Hebrew messages), and the API
 * checks them again because it cannot trust the form. This file has no imports, so the API (server/)
 * can use it as it is.
 */

export const NAME_MIN_LENGTH = 2
export const NAME_MAX_LENGTH = 60

/** The longest email address there can be (RFC 5321). */
export const EMAIL_MAX_LENGTH = 254

export const PASSWORD_MIN_LENGTH = 8
/** A limit on what the API has to hash, not a rule about strength. */
export const PASSWORD_MAX_LENGTH = 128

/**
 * What a password is hashed as: `server/src/auth/passwords.ts` hashes and checks `normalize('NFKC')` of
 * it. The length limits and the comparisons below are about this form as well as about what was typed.
 */
export const normalizePassword = (password: string) => password.normalize('NFKC')

/** The length in Unicode code points (an emoji is one), which is how the limits count. */
export const passwordLength = (password: string) => [...password].length

/**
 * What a password is compared as, to the list of common passwords and to the email: in NFKC and in lower
 * case, so that a fullwidth or a capitalized copy of a password is the same password. Never trimmed: the
 * spaces of a password are part of it.
 */
export const passwordKey = (password: string) => normalizePassword(password).toLowerCase()

/**
 * Too few characters. A new password needs at least `PASSWORD_MIN_LENGTH` both as it was typed and as it is
 * hashed (`normalizePassword`), so that neither a decomposed accent (two code points that NFKC makes one)
 * nor a character that NFKC makes many (one typed, eighteen hashed) can be what makes it long enough.
 */
export const passwordTooShort = (password: string) =>
  Math.min(passwordLength(password), passwordLength(normalizePassword(password))) <
  PASSWORD_MIN_LENGTH

/** Too many characters, as it was typed or as it is hashed: NFKC can make a password longer. */
export const passwordTooLong = (password: string) =>
  Math.max(passwordLength(password), passwordLength(normalizePassword(password))) >
  PASSWORD_MAX_LENGTH

/**
 * Whether the password is the address of the account, compared as passwords are (NFKC, lower case) with
 * the address as it is stored (`normalizeEmail`). The password is not trimmed: a space around it makes it
 * another password.
 */
export const passwordIsEmail = (password: string, email: string) =>
  passwordKey(password) === passwordKey(normalizeEmail(email))

/**
 * Whether the text has no lone surrogate. A lone surrogate is not text: it cannot be written in UTF-8, so
 * Node hashes it as U+FFFD, and two different ones (or one of them and a real U+FFFD) would be the same
 * password. It is checked by hand, as `String.prototype.isWellFormed` is newer than the browsers the
 * build supports.
 */
export function passwordIsWellFormed(password: string) {
  for (let i = 0; i < password.length; i++) {
    const unit = password.charCodeAt(i)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = password.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      i++
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false
    }
  }
  return true
}

/** Emails are compared in lower case, without surrounding spaces. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}
