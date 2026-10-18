// The extensions are required because the API (server/) imports this file through the registration schema.
import { isCommonPassword } from './commonPasswords.ts'
import { passwordIsWellFormed, passwordTooLong, passwordTooShort } from './rules.ts'

/**
 * Why a new password is refused, apart from being the address of the account (that needs the address:
 * `passwordIsEmail`). There is no rule about which characters it must hold: any text of eight characters or
 * more is a password, in any language, with spaces and emoji, unless it is one of the passwords that
 * everyone tries first.
 */
export type PasswordProblem = 'too-short' | 'too-long' | 'malformed' | 'common'

/**
 * The first reason a new password is refused, or null. The form and the API both ask this, so that they
 * cannot disagree: the form turns the answer into a Hebrew message and the API into `400 invalid_input`.
 * Signing in does not ask it: an account may have been made when the rules were others.
 */
export function passwordProblem(password: string): PasswordProblem | null {
  if (passwordTooShort(password)) return 'too-short'
  if (passwordTooLong(password)) return 'too-long'
  if (!passwordIsWellFormed(password)) return 'malformed'
  if (isCommonPassword(password)) return 'common'
  return null
}
