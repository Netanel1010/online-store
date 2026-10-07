import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { z } from 'zod'
import {
  endAllSessions,
  endSession,
  fetchCurrentUser,
  loginAccount,
  registerAccount,
  type AuthFailure,
  type CurrentUser,
  type SignedIn,
} from './authService'

export type { CurrentUser } from './authService'

/**
 * The visitor's session. The accounts and the sessions live in the API (MongoDB); the browser keeps
 * only the session token, in localStorage, so a reload or a new tab stays signed in. Everything else
 * (who the visitor is) is asked of the API, never read from storage.
 *
 *  - restoring: there is a token and the API has not yet said whether it is still good
 *  - authenticated: the API knows the token, `user` is the visitor
 *  - anonymous: no token, or the API does not accept it any more
 *  - unavailable: there is a token but the API could not be asked (offline, asleep, failing); the
 *    token is kept, because nothing has been said against it
 *
 * The token is readable by scripts of this page, which is the price of working across two origins
 * (the site and the API) in every browser: it is short-lived, the API can end it, and the pages
 * render all text as text, never as HTML.
 */
export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous' | 'unavailable'

export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure }

interface AuthState {
  token: string | null
  /** When the session ends, as an ISO date. */
  expiresAt: string | null
  user: CurrentUser | null
  status: AuthStatus
  register: (input: { name: string; email: string; password: string }) => Promise<AuthResult>
  login: (input: { email: string; password: string }) => Promise<AuthResult>
  /** Signs out here at once, and asks the API to end the session (best effort). */
  logout: () => void
  /**
   * Asks the API to end every session of the account, on every device. It does not sign out here:
   * the caller does that once this says `true`. `false` means the API could not be asked, so
   * nothing is known to have ended and the visitor stays signed in to try again.
   */
  endAllSessions: () => Promise<boolean>
  /** Asks the API whether the stored token is still good. Safe to call from many places. */
  restore: () => Promise<void>
}

/** Where the demo accounts of the first version of the site lived. They are not used any more. */
const LEGACY_KEY = 'online-store:auth'
try {
  localStorage.removeItem(LEGACY_KEY)
} catch {
  // No storage (private mode, tests without a DOM): there is nothing to clean.
}

// Defined before the store: persist rehydrates, and so calls `merge`, while the store is created.
const persistedSchema = z.object({
  token: z.string().min(16).nullable(),
  expiresAt: z.iso.datetime().nullable(),
})

/** How long the API gets to confirm a stored session before the visitor is told it cannot be reached. */
const RESTORE_TIMEOUT_MS = 60_000

const SIGNED_OUT = { token: null, expiresAt: null, user: null } as const

function signedInState({ token, expiresAt, user }: SignedIn) {
  return { token, expiresAt, user, status: 'authenticated' as const }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      // The question being asked, and about which token: another token is another question.
      let restoring: { token: string; promise: Promise<void> } | null = null

      async function enter(
        request: Promise<Awaited<ReturnType<typeof loginAccount>>>,
      ): Promise<AuthResult> {
        const outcome = await request
        if (!outcome.ok) return outcome
        set(signedInState(outcome.value))
        return { ok: true }
      }

      return {
        ...SIGNED_OUT,
        status: 'anonymous',

        register: (input) => enter(registerAccount(input)),
        login: (input) => enter(loginAccount(input)),

        logout: () => {
          const { token } = get()
          set({ ...SIGNED_OUT, status: 'anonymous' })
          if (token) void endSession(token)
        },

        endAllSessions: async () => {
          const { token } = get()
          if (!token) return false
          return (await endAllSessions(token)) !== 'unavailable'
        },

        restore: () => {
          const { token, status } = get()
          if (!token) return Promise.resolve()
          // Already known, or already being asked: nothing to add.
          if (status === 'authenticated') return Promise.resolve()
          if (restoring?.token === token) return restoring.promise

          set({ status: 'restoring' })
          // The timeout is there so that an API that never answers ends in "unavailable" (with a retry)
          // instead of a page that waits for ever. A host that is waking up can take about a minute.
          const promise = fetchCurrentUser(token, AbortSignal.timeout(RESTORE_TIMEOUT_MS))
            .then((outcome) => {
              // The visitor signed out (or in as someone else) while the API was answering.
              if (get().token !== token) return
              if (outcome.status === 'signed-in')
                set({ user: outcome.user, status: 'authenticated' })
              else if (outcome.status === 'signed-out') set({ ...SIGNED_OUT, status: 'anonymous' })
              else set({ status: 'unavailable' })
            })
            .finally(() => {
              if (restoring?.promise === promise) restoring = null
            })
          restoring = { token, promise }
          return promise
        },
      }
    },
    {
      name: 'online-store:session',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only the token: who the visitor is comes from the API, and no password is ever kept.
      partialize: (state) => ({ token: state.token, expiresAt: state.expiresAt }),
      // Stored data is untrusted (it can be edited or corrupted): validate, never spread it in.
      merge: (persisted, current) => {
        const parsed = persistedSchema.safeParse(persisted)
        if (!parsed.success || parsed.data.token === null || parsed.data.expiresAt === null) {
          return current
        }
        // A session that has ended is not worth asking the API about.
        if (Date.parse(parsed.data.expiresAt) <= Date.now()) return current
        return {
          ...current,
          token: parsed.data.token,
          expiresAt: parsed.data.expiresAt,
          user: null,
          status: 'restoring',
        }
      },
    },
  ),
)

/** The signed-in visitor (without credentials), or undefined when there is none (yet). */
export function useCurrentUser(): CurrentUser | undefined {
  return useAuthStore((state) => state.user ?? undefined)
}

export function useAuthStatus(): AuthStatus {
  return useAuthStore((state) => state.status)
}
