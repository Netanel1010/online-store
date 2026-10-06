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

export const passwordHasLetter = (password: string) => /\p{L}/u.test(password)
export const passwordHasDigit = (password: string) => /\d/.test(password)

/** Emails are compared in lower case, without surrounding spaces. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}
