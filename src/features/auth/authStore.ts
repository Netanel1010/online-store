import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { z } from 'zod'
import { generateSalt, hashPassword, verifyPassword } from '@/lib/password'

/**
 * DEMO authentication. There is no server: accounts and the session live in this browser's
 * localStorage, so this demonstrates the screens and the route protection but provides no real
 * security (anyone with access to the browser can read or edit this data).
 *
 * Passwords are never stored in readable form, only as a salted PBKDF2 hash.
 */

export interface StoredUser {
  id: string
  name: string
  email: string
  salt: string
  passwordHash: string
  createdAt: string
}

/** What the rest of the app may see about the signed-in user. Never includes the hash. */
export interface CurrentUser {
  id: string
  name: string
  email: string
}

export type AuthResult = { ok: true } | { ok: false; reason: 'email-taken' | 'invalid-credentials' }

interface AuthState {
  users: StoredUser[]
  /** The signed-in user's id, or null. This is the demo "session". */
  currentUserId: string | null
  register: (input: { name: string; email: string; password: string }) => Promise<AuthResult>
  login: (input: { email: string; password: string }) => Promise<AuthResult>
  logout: () => void
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

// Defined before the store: persist rehydrates, and so calls `merge`, while the store is created.
const persistedAuthSchema = z.object({
  users: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      email: z.string().min(1),
      salt: z.string().regex(/^[0-9a-f]{32}$/),
      passwordHash: z.string().regex(/^[0-9a-f]{64}$/),
      createdAt: z.string().min(1),
    }),
  ),
  currentUserId: z.string().nullable(),
})

// Used so that logging in with an unknown email takes about as long as a wrong password.
const DUMMY_SALT = '00000000000000000000000000000000'

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: [],
      currentUserId: null,

      register: async ({ name, email, password }) => {
        const normalized = normalizeEmail(email)
        if (get().users.some((user) => user.email === normalized)) {
          return { ok: false, reason: 'email-taken' }
        }

        const salt = generateSalt()
        const user: StoredUser = {
          id: crypto.randomUUID(),
          name: name.trim(),
          email: normalized,
          salt,
          passwordHash: await hashPassword(password, salt),
          createdAt: new Date().toISOString(),
        }

        // Check again at write time: another registration may have finished while hashing.
        let taken = false
        set((state) => {
          if (state.users.some((existing) => existing.email === normalized)) {
            taken = true
            return state
          }
          return { users: [...state.users, user], currentUserId: user.id }
        })
        return taken ? { ok: false, reason: 'email-taken' } : { ok: true }
      },

      login: async ({ email, password }) => {
        const user = get().users.find((candidate) => candidate.email === normalizeEmail(email))
        const valid = user
          ? await verifyPassword(password, user.salt, user.passwordHash)
          : (await hashPassword(password, DUMMY_SALT), false)

        // The same answer for an unknown email and a wrong password.
        if (!user || !valid) return { ok: false, reason: 'invalid-credentials' }
        set({ currentUserId: user.id })
        return { ok: true }
      },

      logout: () => set({ currentUserId: null }),
    }),
    {
      name: 'online-store:auth',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ users: state.users, currentUserId: state.currentUserId }),
      // Stored data is untrusted (it can be edited or corrupted): validate, never spread it in.
      merge: (persisted, current) => {
        const parsed = persistedAuthSchema.safeParse(persisted)
        if (!parsed.success) return current

        const users: StoredUser[] = []
        for (const user of parsed.data.users) {
          if (!users.some((kept) => kept.id === user.id || kept.email === user.email)) {
            users.push(user)
          }
        }
        // A session is only valid if its account exists.
        const currentUserId = users.some((user) => user.id === parsed.data.currentUserId)
          ? parsed.data.currentUserId
          : null
        return { ...current, users, currentUserId }
      },
    },
  ),
)

const selectStoredCurrentUser = (state: AuthState) =>
  state.users.find((user) => user.id === state.currentUserId)

/** The signed-in user (without credentials), or undefined when signed out. */
export function useCurrentUser(): CurrentUser | undefined {
  const stored = useAuthStore(selectStoredCurrentUser)
  return useMemo(
    () => (stored ? { id: stored.id, name: stored.name, email: stored.email } : undefined),
    [stored],
  )
}
