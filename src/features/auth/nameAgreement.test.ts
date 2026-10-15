import { HttpError } from '../../../server/src/lib/httpError'
import { parseRegisterBody } from '../../../server/src/auth/schemas'
import { deliveryDetailsSchema } from '@/features/checkout/delivery'
import {
  NAMES_THAT_ARE_KEPT,
  NAMES_THAT_ARE_TIDIED,
  NAMES_THE_CHECKOUT_ACCEPTS,
  NAME_WITH,
  NOT_TEXT_IN_A_NAME,
} from '@/test/nameCases'
import { registerSchema } from './schemas'

/**
 * The registration form and the API read an account name with rules that must agree: the form helps the
 * visitor, the API is the one that cannot be argued with. This runs the same names through both, and
 * through the rules of the name on the checkout, which starts with the name of the account.
 *
 * It checks the agreement and does not repeat the other suites: where in a name a character is put (the
 * start, the end, both ends, the middle) is tried for every character by the API's own tests
 * (`server/src/auth/schemas.test.ts`) and the form's (`schemas.test.ts`), so each character is tried
 * here once, in the middle of a name.
 */
const password = 'Passw0rdOK'
const email = 'netanel@example.com'

/** What the form makes of the name, or null when it refuses it. */
function byTheForm(name: string): string | null {
  const result = registerSchema.safeParse({ name, email, password, confirmPassword: password })
  return result.success ? result.data.name : null
}

/** What the API makes of the name, or null when it refuses it (with the error it answers). */
function byTheApi(name: string): string | null {
  try {
    return parseRegisterBody({ name, email, password }).name
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 400, code: 'invalid_input' })
    return null
  }
}

const byTheCheckout = (name: string) => deliveryDetailsSchema.shape.fullName.safeParse(name)

describe('a character that is not text, in the middle of a name', () => {
  it.each(NOT_TEXT_IN_A_NAME)(
    'is refused by the form, by the API and by the checkout: %s',
    (_label, char) => {
      const name = NAME_WITH.inTheMiddle(char)

      expect(byTheForm(name)).toBeNull()
      expect(byTheApi(name)).toBeNull()
      expect(byTheCheckout(name).success).toBe(false)
    },
  )
})

describe('a name that is read', () => {
  it.each([...NAMES_THAT_ARE_TIDIED, ...NAMES_THAT_ARE_KEPT.map(([l, n]) => [l, n, n] as const)])(
    'is stored the same way by the form and by the API: %s',
    (_what, typed, stored) => {
      expect(byTheForm(typed)).toBe(stored)
      expect(byTheApi(typed)).toBe(stored)
    },
  )
})

describe('the name of an account, and the checkout that starts with it', () => {
  it.each(NAMES_THE_CHECKOUT_ACCEPTS)(
    'a name kept as typed is one that the checkout accepts: %s',
    (_what, name) => {
      const stored = byTheApi(name)

      expect(stored).toBe(name)
      expect(byTheCheckout(stored!).success).toBe(true)
    },
  )

  it.each(NAMES_THAT_ARE_TIDIED)(
    'a name that was tidied is stored in a form that the checkout accepts as it is: %s',
    (_what, typed) => {
      const stored = byTheApi(typed)!

      expect(byTheCheckout(stored).data).toBe(stored)
    },
  )
})
