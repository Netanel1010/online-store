import { parseRegisterBody } from '../../../server/src/auth/schemas'
import {
  PASSWORDS_THAT_ARE_ACCEPTED,
  PASSWORDS_THAT_ARE_NOT_THE_EMAIL,
  PASSWORDS_THAT_ARE_REFUSED,
  PASSWORDS_THAT_ARE_THE_EMAIL,
} from '@/test/passwordCases'
import { registerSchema } from './registerSchema'

/**
 * The registration form and the API read a new password with rules that must agree: the form helps the
 * visitor, the API is the one that cannot be argued with. This runs the same passwords through both. (What
 * each rule is, and what the form says about it, is tried by `passwordPolicy.test.ts` and `schemas.test.ts`,
 * and by the API's own tests.)
 */
const name = 'נתנאל'
const ADDRESS = 'netanel@example.com'

const byTheForm = (password: string, email = ADDRESS) =>
  registerSchema.safeParse({ name, email, password, confirmPassword: password }).success

function byTheApi(password: string, email = ADDRESS) {
  try {
    parseRegisterBody({ name, email, password })
    return true
  } catch {
    return false
  }
}

describe('a new password is accepted or refused alike by the form and by the API', () => {
  it.each(PASSWORDS_THAT_ARE_ACCEPTED)('accepts %s', (_what, password) => {
    expect(byTheForm(password)).toBe(true)
    expect(byTheApi(password)).toBe(true)
  })

  it.each(PASSWORDS_THAT_ARE_REFUSED)('refuses %s', (_what, password) => {
    expect(byTheForm(password)).toBe(false)
    expect(byTheApi(password)).toBe(false)
  })

  it.each(PASSWORDS_THAT_ARE_THE_EMAIL)('refuses %s', (_what, password, email) => {
    expect(byTheForm(password, email)).toBe(false)
    expect(byTheApi(password, email)).toBe(false)
  })

  it.each(PASSWORDS_THAT_ARE_NOT_THE_EMAIL)('accepts %s', (_what, password, email) => {
    expect(byTheForm(password, email)).toBe(true)
    expect(byTheApi(password, email)).toBe(true)
  })
})
