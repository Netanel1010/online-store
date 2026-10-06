import { z } from 'zod'
import { apiUrl } from '@/lib/api'

/** What the rest of the app may see about the signed-in visitor. */
export interface CurrentUser {
  id: string
  name: string
  email: string
}

/** What went wrong, in the terms the screens care about. */
export type AuthFailure =
  | 'email-taken'
  | 'invalid-credentials'
  | 'too-many-attempts'
  /** The API refused what was sent (the forms check it first, so this is rare). */
  | 'invalid-input'
  /** The API could not be reached, or answered with something unexpected. */
  | 'unavailable'

export type AuthOutcome<T> = { ok: true; value: T } | { ok: false; reason: AuthFailure }

export interface SignedIn {
  user: CurrentUser
  /** The session token, sent back as `Authorization: Bearer <token>`. */
  token: string
  /** When the session ends, as an ISO date. */
  expiresAt: string
}

const userSchema = z.object({ id: z.string().min(1), name: z.string(), email: z.string() })
const signedInSchema = z.object({
  user: userSchema,
  token: z.string().min(16),
  expiresAt: z.iso.datetime(),
})
const meSchema = z.object({ user: userSchema })

/**
 * The API's answers to the authentication requests, as the screens use them. A network failure, a
 * 5xx or an answer of an unexpected shape are all "unavailable": none of them says anything about
 * the account, so none of them may sign anyone out.
 */
/** How long a sign-in, a registration or a sign-out gets, so that a form never waits for ever. */
const REQUEST_TIMEOUT_MS = 60_000

async function post(path: string, body: unknown, token?: string): Promise<Response | null> {
  try {
    return await fetch(apiUrl(path), {
      method: 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    return null
  }
}

async function readSignedIn(
  response: Response | null,
  failures: Partial<Record<number, AuthFailure>>,
): Promise<AuthOutcome<SignedIn>> {
  if (response === null) return { ok: false, reason: 'unavailable' }
  if (response.ok) {
    const parsed = signedInSchema.safeParse(await response.json().catch(() => null))
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: 'unavailable' }
  }
  return { ok: false, reason: failures[response.status] ?? 'unavailable' }
}

export async function registerAccount(input: {
  name: string
  email: string
  password: string
}): Promise<AuthOutcome<SignedIn>> {
  return readSignedIn(await post('/api/auth/register', input), {
    409: 'email-taken',
    400: 'invalid-input',
  })
}

export async function loginAccount(input: {
  email: string
  password: string
}): Promise<AuthOutcome<SignedIn>> {
  return readSignedIn(await post('/api/auth/login', input), {
    401: 'invalid-credentials',
    429: 'too-many-attempts',
    400: 'invalid-input',
  })
}

/** Ends the session on the server. It never fails: the visitor is signed out here either way. */
export async function endSession(token: string): Promise<void> {
  const response = await post('/api/auth/logout', undefined, token)
  // Read to the end (it is empty): a response nobody reads is reported by browsers as aborted.
  await response?.text().catch(() => undefined)
}

export type CurrentUserOutcome =
  | { status: 'signed-in'; user: CurrentUser }
  /** The API does not know this token (any more): it expired, ended or never was. */
  | { status: 'signed-out' }
  | { status: 'unavailable' }

/** Asks the API who the token belongs to. */
export async function fetchCurrentUser(
  token: string,
  signal?: AbortSignal,
): Promise<CurrentUserOutcome> {
  let response: Response
  try {
    response = await fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
  } catch {
    return { status: 'unavailable' }
  }
  if (response.status === 401) return { status: 'signed-out' }
  if (!response.ok) return { status: 'unavailable' }
  const parsed = meSchema.safeParse(await response.json().catch(() => null))
  return parsed.success
    ? { status: 'signed-in', user: parsed.data.user }
    : { status: 'unavailable' }
}
