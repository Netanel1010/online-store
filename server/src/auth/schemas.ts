import { z } from 'zod'
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordHasDigit,
  passwordHasLetter,
} from '../../../src/features/auth/rules.ts'
import { HttpError } from '../lib/httpError.ts'

// The same rules as the registration form, which checks them first only to help the visitor.
const name = z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH)

const email = z
  .string()
  .max(EMAIL_MAX_LENGTH)
  .transform(normalizeEmail)
  .pipe(z.email().max(EMAIL_MAX_LENGTH))

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .refine(passwordHasLetter)
  .refine(passwordHasDigit)

// Signing in accepts any password that fits: the rules for a new one may have been different when
// the account was made, and "wrong password" is the answer to a password that does not match.
const existingPassword = z.string().min(1).max(PASSWORD_MAX_LENGTH)

const registerSchema = z.object({ name, email, password: newPassword })
const loginSchema = z.object({ email, password: existingPassword })

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (result.success) return result.data
  // Names the field, never the value: a password must not end up in a response or a log.
  const field = result.error.issues[0]?.path[0]
  throw new HttpError(
    400,
    'invalid_input',
    typeof field === 'string'
      ? `The field "${field}" is not valid`
      : 'The request body is not valid',
  )
}

export const parseRegisterBody = (body: unknown) => parse(registerSchema, body)
export const parseLoginBody = (body: unknown) => parse(loginSchema, body)
