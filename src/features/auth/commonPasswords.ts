// The extensions are required because the API (server/) imports this file through the registration schema.
import { COMMON_PASSWORDS } from './commonPasswords.data.ts'
import { passwordKey } from './rules.ts'

let known: ReadonlySet<string> | undefined

/**
 * Whether a password is one of the most common ones (`commonPasswords.data.ts`, where the list comes from
 * and under which licence is written). Only the whole password is compared, in NFKC and in lower case, so
 * `PASSWORD1` and a fullwidth copy of it are on the list as `password1` is, and `password1!` or `mypassword1`
 * are not: a password is not refused for containing a common one. It is not trimmed either, as a space is
 * part of a password.
 *
 * This file is the only one that reads the list, so that what imports the rules of an account without
 * registering one (the sign-in form, the checkout) does not carry it.
 */
export function isCommonPassword(password: string) {
  known ??= new Set(COMMON_PASSWORDS)
  return known.has(passwordKey(password))
}
