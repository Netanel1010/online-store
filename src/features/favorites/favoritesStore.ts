import { create } from 'zustand'
import { z } from 'zod'
import { useAuthStore } from '@/features/auth/authStore'
import { digest } from '@/features/orders/checkoutAttempt'

/**
 * The favorites of whoever is using the browser, kept in the browser and never sent anywhere. A browser
 * is sometimes shared, so the list belongs to a **person**, not to the browser: the visitor who is not
 * signed in has a list of their own (`guest`), and every account has one of its own, kept under a digest
 * of its id (the id is not in storage). When who is here changes, the list that is shown changes with
 * it, and nobody is shown a list that is not theirs:
 *
 *  - signing in shows the list of that account, and nothing from the guest list goes into it (what a
 *    visitor favorited before signing in may have been put there by somebody else);
 *  - signing out, or a session that ends, shows the guest list again, and the account's list stays where
 *    it is for when the account comes back;
 *  - the guest list is never merged into an account, in either direction.
 *
 * The lists are separate keys, `online-store:favorites:guest` and `online-store:favorites:account:<digest>`.
 * A tab writes only to the key of the person it believes is here, so a tab that has been left open on
 * another account cannot put its favorites into the list of whoever is signed in now.
 *
 * Limits: a list holds at most `MAX_FAVORITES` products (the most that the API is asked about at once;
 * when it is full, the one added first is let go, as the oldest attempt is for an order), and a browser
 * keeps the lists of at most `MAX_ACCOUNT_LISTS` accounts, the ones used last.
 *
 * This keeps one person's list out of the application's view of another's. It is not a defence against
 * code that runs in this page, which can read all of `localStorage` and so every list in it.
 */
export type FavoritesOwner = 'guest' | `account:${string}`

export const GUEST: FavoritesOwner = 'guest'
export const FAVORITES_KEY_PREFIX = 'online-store:favorites:'
/** Where the favorites were kept before there was a list for each person: whose it is cannot be known. */
export const LEGACY_FAVORITES_KEY = 'online-store:favorites'
/** The account that is signed in here, so that a reload shows its list before the API has answered. */
export const SIGNED_IN_AS_KEY = 'online-store:favorites-signed-in-as'
export const MAX_FAVORITES = 100
export const MAX_ACCOUNT_LISTS = 10

const ACCOUNT_KEY_PREFIX = `${FAVORITES_KEY_PREFIX}account:`
const keyOf = (owner: FavoritesOwner) => `${FAVORITES_KEY_PREFIX}${owner}`
export const ownerOfAccount = (userId: string): FavoritesOwner => `account:${digest(userId)}`

interface FavoritesState {
  /** Product ids in the order they were added, of the person who is here. */
  ids: string[]
  /** Whose list `ids` is. */
  owner: FavoritesOwner
  toggle: (productId: string) => void
  remove: (productId: string) => void
  /** Drops ids whose product no longer exists in the catalog. */
  retainOnly: (validIds: ReadonlySet<string>) => void
  clear: () => void
}

const storedSchema = z.object({
  version: z.literal(1),
  ids: z.array(z.string().min(1)),
  usedAt: z.number().int().nonnegative(),
})

/**
 * What this page keeps when storage cannot be used (private mode, blocked, full), so that the lists stay
 * apart there too; and, after a write that storage refused, the lists as they are, which storage no
 * longer shows.
 */
const memory = new Map<FavoritesOwner, string[]>()
let storageRefusedWrite = false

/** Forgets what the page remembers. For tests: nothing in the app resets it. */
export function resetFavoritesMemory(): void {
  memory.clear()
  storageRefusedWrite = false
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // No storage: there is nothing to remove.
  }
}

/** The list of this person as the browser keeps it. Stored data is untrusted: it is read against a schema. */
function readList(owner: FavoritesOwner): string[] {
  if (storageRefusedWrite) return memory.get(owner) ?? []
  let raw: string | null
  try {
    raw = localStorage.getItem(keyOf(owner))
  } catch {
    return memory.get(owner) ?? []
  }
  if (raw === null) return []
  let stored: ReturnType<typeof storedSchema.safeParse>
  try {
    stored = storedSchema.safeParse(JSON.parse(raw))
  } catch {
    stored = storedSchema.safeParse(null)
  }
  if (!stored.success) {
    removeKey(keyOf(owner))
    return []
  }
  return [...new Set(stored.data.ids)].slice(-MAX_FAVORITES)
}

function usedAtOf(key: string): number {
  try {
    const stored = storedSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'))
    return stored.success ? stored.data.usedAt : 0
  } catch {
    return 0
  }
}

/** Lets go of the accounts used longest ago once there are more than `MAX_ACCOUNT_LISTS`; never `keep`. */
function trimAccountLists(keep: FavoritesOwner): void {
  const keys: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(ACCOUNT_KEY_PREFIX)) keys.push(key)
  }
  if (keys.length <= MAX_ACCOUNT_LISTS) return
  keys
    .filter((key) => key !== keyOf(keep))
    .map((key) => ({ key, usedAt: usedAtOf(key) }))
    .sort((a, b) => a.usedAt - b.usedAt)
    .slice(0, keys.length - MAX_ACCOUNT_LISTS)
    .forEach(({ key }) => localStorage.removeItem(key))
}

function writeList(owner: FavoritesOwner, ids: string[]): void {
  memory.set(owner, ids)
  try {
    if (ids.length === 0) localStorage.removeItem(keyOf(owner))
    else localStorage.setItem(keyOf(owner), JSON.stringify({ version: 1, ids, usedAt: Date.now() }))
    storageRefusedWrite = false
    if (owner !== GUEST) trimAccountLists(owner)
  } catch {
    // No storage (private mode, full): the list is kept by this page, and only for this person.
    storageRefusedWrite = true
  }
}

function rememberedAccount(): FavoritesOwner | null {
  try {
    const value = localStorage.getItem(SIGNED_IN_AS_KEY)
    return value !== null && /^account:[0-9a-z]{1,16}$/.test(value)
      ? (value as FavoritesOwner)
      : null
  } catch {
    return null
  }
}

function rememberAccount(owner: FavoritesOwner | null): void {
  try {
    if (owner === null) localStorage.removeItem(SIGNED_IN_AS_KEY)
    else localStorage.setItem(SIGNED_IN_AS_KEY, owner)
  } catch {
    // No storage: a reload shows the guest list until the API says who is signed in.
  }
}

/**
 * Who is here as the page opens. A signed-in account is known once the API has answered; until then the
 * account that was signed in here is the one whose list is shown, so that a reload does not show the
 * guest list for a moment. Without a stored session it is the guest.
 */
function ownerAtStart(): FavoritesOwner {
  const { user, token } = useAuthStore.getState()
  if (user) return ownerOfAccount(user.id)
  return token ? (rememberedAccount() ?? GUEST) : GUEST
}

// The list kept before there were lists for each person: nobody can say whose it is, so it is let go.
removeKey(LEGACY_FAVORITES_KEY)

const startOwner = ownerAtStart()

export const useFavoritesStore = create<FavoritesState>()((set, get) => {
  /** Changes the list of the person who is here, starting from what the browser keeps (not this tab's copy). */
  function change(update: (current: string[]) => string[]) {
    const { owner, ids } = get()
    const current = readList(owner)
    const next = update(current)
    const same = (a: string[], b: string[]) =>
      a.length === b.length && a.every((id, i) => id === b[i])
    if (same(next, current) && same(next, ids)) return
    writeList(owner, next)
    set({ ids: next })
  }

  return {
    ids: readList(startOwner),
    owner: startOwner,

    toggle: (productId) =>
      change((current) =>
        current.includes(productId)
          ? current.filter((id) => id !== productId)
          : [...current, productId].slice(-MAX_FAVORITES),
      ),

    remove: (productId) => change((current) => current.filter((id) => id !== productId)),

    retainOnly: (validIds) => change((current) => current.filter((id) => validIds.has(id))),

    clear: () => change(() => []),
  }
})

export const selectIsFavorite = (productId: string) => (state: FavoritesState) =>
  state.ids.includes(productId)

/** Shows the list of `owner`, read from the browser. Writing to storage is left to the changes of a list. */
function showListOf(owner: FavoritesOwner): void {
  const ids = readList(owner)
  // Looking at a list keeps its account among the ones used last.
  if (owner !== GUEST && ids.length > 0) writeList(owner, ids)
  useFavoritesStore.setState({ owner, ids })
}

/**
 * Keeps the list that is shown the list of the person who is here. Started once by the layout of the
 * whole site; returns the function that stops it.
 *
 *  - An account that is signed in (confirmed by the API) is the owner; its list is shown, and it is
 *    remembered, so that the next reload shows it at once.
 *  - No stored session (signing out, a session that ended, a session found to be over) makes the guest
 *    the owner and forgets the account; the account's list stays in storage.
 *  - A stored session that the API has not answered for (it is being asked, or cannot be reached) changes
 *    nothing: the list that was shown stays.
 *  - Another tab that changes the list of the owner is followed; a change to any other list is not.
 */
export function startFavoritesOwner(): () => void {
  const follow = ({ user, token }: ReturnType<typeof useAuthStore.getState>) => {
    if (user) {
      const owner = ownerOfAccount(user.id)
      rememberAccount(owner)
      if (useFavoritesStore.getState().owner !== owner) showListOf(owner)
    } else if (!token) {
      rememberAccount(null)
      if (useFavoritesStore.getState().owner !== GUEST) showListOf(GUEST)
    }
  }
  follow(useAuthStore.getState())
  const stopAuth = useAuthStore.subscribe((state, previous) => {
    if (state.user?.id !== previous.user?.id || state.token !== previous.token) follow(state)
  })

  const followOtherTabs = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return
    const { owner, ids } = useFavoritesStore.getState()
    // `null` is the whole storage cleared; anything else is one key, and only the owner's is of interest.
    if (event.key !== null && event.key !== keyOf(owner)) return
    const stored = readList(owner)
    if (stored.length !== ids.length || stored.some((id, index) => id !== ids[index])) {
      useFavoritesStore.setState({ ids: stored })
    }
  }
  window.addEventListener('storage', followOtherTabs)

  return () => {
    stopAuth()
    window.removeEventListener('storage', followOtherTabs)
  }
}
