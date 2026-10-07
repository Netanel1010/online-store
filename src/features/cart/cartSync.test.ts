import { waitFor } from '@testing-library/react'
import { useAuthStore } from '@/features/auth/authStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { setUpAuthApi } from '@/test/authApi'
import { makeProduct } from '@/test/fixtures'
import { setServerLine } from './cartService'
import { CART_SYNC_NOTICES, cartSyncPolicy, startCartSync } from './cartSync'
import { readCartMarker, writeCartMarker } from './cartSyncMarker'
import { useCartSyncStatus } from './cartSyncStatus'
import { useCartStore } from './cartStore'

// The real API answers (the cart routes and service over carts kept in memory): what these tests
// check is what the browser sends and what the API then holds, not a script of requests.
const api = setUpAuthApi()

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }
const OTHER = { name: 'דנה', email: 'dana@example.com', password: 'Passw0rdOK' }

const A = makeProduct({ id: 'A-1', name: 'א' })
const B = makeProduct({ id: 'B-2', name: 'ב' })
const C = makeProduct({ id: 'C-3', name: 'ג' })

let stop: (() => void) | undefined
const notify = vi.fn<(message: string) => void>()

beforeEach(() => {
  api.setCatalog([A, B, C])
  notify.mockClear()
  cartSyncPolicy.debounceMs = 0
  cartSyncPolicy.retryDelaysMs = [3_600_000]
})
afterEach(() => {
  stop?.()
  stop = undefined
})

const start = () => {
  stop = startCartSync(notify)
}
const local = () => useCartStore.getState().items
const signIn = async (account = GOOD) => {
  await useAuthStore.getState().register(account)
  return { token: useAuthStore.getState().token!, userId: useAuthStore.getState().user!.id }
}
/** The lines the API holds for an account. */
const onApi = (userId: string) => api.carts().get(userId)?.items ?? []

/** Counts and passes on the requests of the cart. */
function watchRequests() {
  const inner = globalThis.fetch
  const seen: { method: string; path: string }[] = []
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/cart')) {
      seen.push({ method: init?.method ?? 'GET', path: url.slice(url.indexOf('/api/cart')) })
    }
    return inner(input, init)
  })
  return seen
}

describe('signing in', () => {
  it('saves the cart a visitor filled in before signing in to the account', async () => {
    useCartStore.getState().addItem('A-1', 2)
    useCartStore.getState().addItem('B-2')
    const { userId } = await signIn()

    start()

    await waitFor(() =>
      expect(onApi(userId)).toEqual([
        { productId: 'A-1', quantity: 2 },
        { productId: 'B-2', quantity: 1 },
      ]),
    )
    expect(local()).toEqual(onApi(userId))
  })

  it('joins the cart of the account with the one in this browser: every product, the larger quantity', async () => {
    const { token, userId } = await signIn()
    await setServerLine(token, 'A-1', 3)
    await setServerLine(token, 'B-2', 1)
    useCartStore.getState().addItem('A-1', 2)
    useCartStore.getState().addItem('B-2', 4)
    useCartStore.getState().addItem('C-3')

    start()

    const joined = [
      { productId: 'A-1', quantity: 3 },
      { productId: 'B-2', quantity: 4 },
      { productId: 'C-3', quantity: 1 },
    ]
    await waitFor(() => expect(onApi(userId)).toEqual(joined))
    expect(local()).toEqual(joined)
  })

  it('shows the cart of the account to a browser with an empty one', async () => {
    const { token } = await signIn()
    await setServerLine(token, 'A-1', 2)

    start()

    await waitFor(() => expect(local()).toEqual([{ productId: 'A-1', quantity: 2 }]))
  })

  it('does not add a cart twice when the same cart meets itself again', async () => {
    const { token, userId } = await signIn()
    await setServerLine(token, 'A-1', 2)
    useCartStore.getState().addItem('A-1', 2)
    // The cart in this browser is a copy that has changes not yet sent (as after a closed tab).
    writeCartMarker({ owner: userId, dirty: true })

    start()

    await waitFor(() => expect(settled(userId)).toBe(true))
    expect(onApi(userId)).toEqual([{ productId: 'A-1', quantity: 2 }])
    expect(local()).toEqual([{ productId: 'A-1', quantity: 2 }])
  })

  it('takes the cart of the account when the one here is only an older copy of it', async () => {
    const { token, userId } = await signIn()
    // This browser sent {A, B}. Then the account's cart changed on another device: B was removed.
    await setServerLine(token, 'A-1', 1)
    useCartStore.setState({
      items: [
        { productId: 'A-1', quantity: 1 },
        { productId: 'B-2', quantity: 1 },
      ],
    })
    writeCartMarker({ owner: userId, dirty: false })

    start()

    await waitFor(() => expect(local()).toEqual([{ productId: 'A-1', quantity: 1 }]))
    expect(onApi(userId)).toEqual([{ productId: 'A-1', quantity: 1 }])
  })

  it('sends what was changed here and not yet sent, instead of taking the account’s cart', async () => {
    const { token, userId } = await signIn()
    await setServerLine(token, 'A-1', 1)
    useCartStore.setState({ items: [{ productId: 'B-2', quantity: 2 }] })
    writeCartMarker({ owner: userId, dirty: true })

    start()

    await waitFor(() => expect(onApi(userId)).toEqual([{ productId: 'B-2', quantity: 2 }]))
    expect(local()).toEqual([{ productId: 'B-2', quantity: 2 }])
  })

  it('also sends a line removed here and not yet sent, so that it does not come back', async () => {
    const { token, userId } = await signIn()
    await setServerLine(token, 'A-1', 1)
    await setServerLine(token, 'B-2', 1)
    // The cart was emptied (an order was placed), and the page was left before that was sent.
    useCartStore.setState({ items: [] })
    writeCartMarker({ owner: userId, dirty: true })

    start()

    await waitFor(() => expect(onApi(userId)).toEqual([]))
    expect(local()).toEqual([])
  })

  it('does not hand the cart left in this browser by another account to this one', async () => {
    const first = await signIn(OTHER)
    useCartStore.setState({ items: [{ productId: 'B-2', quantity: 2 }] })
    writeCartMarker({ owner: first.userId, dirty: false })
    useAuthStore.setState({ token: null, user: null, status: 'anonymous', expiresAt: null })
    const { token, userId } = await signIn(GOOD)
    await setServerLine(token, 'A-1', 1)

    start()

    await waitFor(() => expect(local()).toEqual([{ productId: 'A-1', quantity: 1 }]))
    expect(onApi(userId)).toEqual([{ productId: 'A-1', quantity: 1 }])
  })

  it('says that the cart is being read until it has arrived', async () => {
    const { token } = await signIn()
    await setServerLine(token, 'A-1', 1)

    start()

    expect(useCartSyncStatus.getState().reading).toBe(true)
    await waitFor(() => expect(useCartSyncStatus.getState().reading).toBe(false))
    expect(local()).toHaveLength(1)
  })

  it('sends nothing while nobody is signed in', async () => {
    const requests = watchRequests()

    start()
    useCartStore.getState().addItem('A-1')
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(requests).toEqual([])
    expect(useCartStore.getState().items).toHaveLength(1)
  })
})

/** True when the browser and the API agree and the browser knows it. */
function settled(userId: string) {
  return (
    JSON.stringify(onApi(userId)) === JSON.stringify(local()) && readCartMarker()?.dirty === false
  )
}

describe('while signed in', () => {
  async function signedInAndSynced() {
    const account = await signIn()
    start()
    await waitFor(() => expect(useCartSyncStatus.getState().reading).toBe(false))
    return account
  }

  it('sends what is added, changed and removed', async () => {
    const { userId } = await signedInAndSynced()

    useCartStore.getState().addItem('A-1')
    await waitFor(() => expect(onApi(userId)).toEqual([{ productId: 'A-1', quantity: 1 }]))
    useCartStore.getState().setQuantity('A-1', 5)
    await waitFor(() => expect(onApi(userId)).toEqual([{ productId: 'A-1', quantity: 5 }]))
    useCartStore.getState().addItem('B-2', 2)
    await waitFor(() => expect(onApi(userId)).toHaveLength(2))
    useCartStore.getState().removeItem('A-1')
    await waitFor(() => expect(onApi(userId)).toEqual([{ productId: 'B-2', quantity: 2 }]))
  })

  it('empties the cart of the account in one request when it is emptied here', async () => {
    const { userId } = await signedInAndSynced()
    useCartStore.getState().addItem('A-1')
    useCartStore.getState().addItem('B-2')
    await waitFor(() => expect(onApi(userId)).toHaveLength(2))
    const requests = watchRequests()

    useCartStore.getState().clear()

    await waitFor(() => expect(onApi(userId)).toEqual([]))
    expect(requests).toEqual([{ method: 'DELETE', path: '/api/cart' }])
  })

  it('turns a burst of clicks into one request, with the quantity it ended at', async () => {
    cartSyncPolicy.debounceMs = 40
    const { userId } = await signedInAndSynced()
    const requests = watchRequests()

    for (let i = 0; i < 5; i += 1) useCartStore.getState().addItem('A-1')
    await waitFor(() => expect(onApi(userId)).toEqual([{ productId: 'A-1', quantity: 5 }]))

    expect(requests).toEqual([{ method: 'PUT', path: '/api/cart/items/A-1' }])
  })

  it('writes down that everything has been sent, and that something has not', async () => {
    const { userId } = await signedInAndSynced()
    await waitFor(() => expect(readCartMarker()).toEqual({ owner: userId, dirty: false }))

    useCartStore.getState().addItem('A-1')
    expect(readCartMarker()).toEqual({ owner: userId, dirty: true })

    await waitFor(() => expect(readCartMarker()).toEqual({ owner: userId, dirty: false }))
  })

  it('leaves alone a line added on another device, which this browser has not heard of', async () => {
    const { token, userId } = await signedInAndSynced()
    useCartStore.getState().addItem('A-1')
    await waitFor(() => expect(onApi(userId)).toHaveLength(1))
    await setServerLine(token, 'C-3', 2) // "on another device"

    useCartStore.getState().setQuantity('A-1', 3)

    await waitFor(() => expect(onApi(userId)[0]).toEqual({ productId: 'A-1', quantity: 3 }))
    expect(onApi(userId)).toContainEqual({ productId: 'C-3', quantity: 2 })
  })

  it('takes a product out of the cart, and says so, when the API will not have it', async () => {
    const { userId } = await signedInAndSynced()

    useCartStore.getState().addItem('GONE-1')
    useCartStore.getState().addItem('A-1')

    await waitFor(() => expect(local()).toEqual([{ productId: 'A-1', quantity: 1 }]))
    await waitFor(() => expect(onApi(userId)).toEqual([{ productId: 'A-1', quantity: 1 }]))
    expect(notify).toHaveBeenCalledWith(CART_SYNC_NOTICES.rejected)
  })

  it('takes out, and says so, a product that does not fit in a cart that is full', async () => {
    const many = Array.from({ length: 51 }, (_, i) => makeProduct({ id: `P-${i + 1}` }))
    api.setCatalog(many)
    const { userId } = await signedInAndSynced()

    for (const product of many) useCartStore.getState().addItem(product.id)

    await waitFor(() => expect(notify).toHaveBeenCalledWith(CART_SYNC_NOTICES.full))
    await waitFor(() => expect(settled(userId)).toBe(true))
    expect(onApi(userId)).toHaveLength(50)
    expect(local()).toHaveLength(50)
    expect(local().map((line) => line.productId)).not.toContain('P-51')
  })

  it('stops sending, and keeps the cart here, when the API no longer knows the session', async () => {
    const { userId } = await signedInAndSynced()
    api.endAllSessions()
    const requests = watchRequests()

    useCartStore.getState().addItem('A-1')
    await waitFor(() => expect(requests).toHaveLength(1))
    useCartStore.getState().addItem('B-2')
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(requests).toHaveLength(1)
    expect(local()).toHaveLength(2)
    expect(onApi(userId)).toEqual([])
  })

  it('stops when it is told to', async () => {
    await signedInAndSynced()
    const requests = watchRequests()

    stop?.()
    stop = undefined
    useCartStore.getState().addItem('A-1')
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(requests).toEqual([])
    expect(local()).toHaveLength(1)
  })
})

describe('when the API cannot be reached', () => {
  /** Every request of the cart fails while `down.value` is true. */
  function breakCartRequests() {
    const inner = globalThis.fetch
    const down = { value: true, tries: 0 }
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/cart') && down.value) {
        down.tries += 1
        return Promise.reject(new TypeError('network down'))
      }
      return inner(input, init)
    })
    return down
  }

  it('keeps the cart here, says so once, and sends it when the API is back', async () => {
    cartSyncPolicy.retryDelaysMs = [20]
    const { userId } = await signIn()
    const down = breakCartRequests()
    start()
    useCartStore.getState().addItem('A-1')
    await waitFor(() => expect(down.tries).toBeGreaterThanOrEqual(2)) // it keeps trying
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(CART_SYNC_NOTICES.offline)
    expect(local()).toEqual([{ productId: 'A-1', quantity: 1 }])

    down.value = false

    await waitFor(() => expect(onApi(userId)).toEqual([{ productId: 'A-1', quantity: 1 }]))
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('tries again at once when the browser says it is online again', async () => {
    cartSyncPolicy.retryDelaysMs = [3_600_000]
    const { userId } = await signIn()
    const down = breakCartRequests()
    start()
    useCartStore.getState().addItem('A-1')
    await waitFor(() => expect(down.tries).toBeGreaterThanOrEqual(1))

    down.value = false
    window.dispatchEvent(new Event('online'))

    await waitFor(() => expect(onApi(userId)).toEqual([{ productId: 'A-1', quantity: 1 }]))
  })

  it('reads the account’s cart as soon as it can, and joins it with what was added meanwhile', async () => {
    cartSyncPolicy.retryDelaysMs = [20]
    const { token, userId } = await signIn()
    await setServerLine(token, 'B-2', 1)
    const down = breakCartRequests()
    start()
    await waitFor(() => expect(down.tries).toBeGreaterThanOrEqual(1))
    useCartStore.getState().addItem('A-1')

    down.value = false

    await waitFor(() => expect(onApi(userId)).toHaveLength(2))
    expect(local().map((line) => line.productId)).toEqual(['B-2', 'A-1'])
    expect(useCartSyncStatus.getState().reading).toBe(false)
  })
})

describe('signing out', () => {
  it('empties the cart here, so that the next person on the computer does not find it, and keeps the account’s', async () => {
    const { userId } = await signIn()
    start()
    useCartStore.getState().addItem('A-1', 2)
    useFavoritesStore.getState().toggle('A-1')
    await waitFor(() => expect(settled(userId)).toBe(true))

    useAuthStore.getState().logout()

    expect(local()).toEqual([])
    expect(readCartMarker()).toBeNull()
    expect(useFavoritesStore.getState().ids).toEqual(['A-1'])
    expect(onApi(userId)).toEqual([{ productId: 'A-1', quantity: 2 }])
  })

  it('sends nothing once the visitor has signed out, not even what was waiting', async () => {
    cartSyncPolicy.debounceMs = 40 // the change is still waiting to be sent when the visitor signs out
    await signIn()
    start()
    await waitFor(() => expect(useCartSyncStatus.getState().reading).toBe(false))
    useCartStore.getState().addItem('A-1', 3)
    const requests = watchRequests()

    useAuthStore.getState().logout()
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(requests).toEqual([])
    expect(local()).toEqual([])
  })

  it('brings the cart back at the next sign-in, on this computer or another', async () => {
    const { userId } = await signIn()
    start()
    useCartStore.getState().addItem('A-1', 2)
    await waitFor(() => expect(settled(userId)).toBe(true))
    useAuthStore.getState().logout()
    expect(local()).toEqual([])

    await useAuthStore.getState().login({ email: GOOD.email, password: GOOD.password })

    await waitFor(() => expect(local()).toEqual([{ productId: 'A-1', quantity: 2 }]))
  })

  it('does not give one account’s cart to the next, even when they share the browser', async () => {
    const first = await signIn(GOOD)
    start()
    useCartStore.getState().addItem('A-1')
    await waitFor(() => expect(settled(first.userId)).toBe(true))
    useAuthStore.getState().logout()

    const second = await signIn(OTHER)

    await waitFor(() => expect(useCartSyncStatus.getState().reading).toBe(false))
    expect(local()).toEqual([])
    expect(onApi(second.userId)).toEqual([])
    expect(onApi(first.userId)).toEqual([{ productId: 'A-1', quantity: 1 }])
  })
})

describe('the requests', () => {
  it('carry only ids and quantities, with the token of the session', async () => {
    const { token } = await signIn()
    const bodies: { url: string; method?: string; body: unknown; auth: string | null }[] = []
    const inner = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/cart')) {
        bodies.push({
          url: String(input),
          method: init?.method,
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
          auth: new Headers(init?.headers).get('Authorization'),
        })
      }
      return inner(input, init)
    })

    useCartStore.getState().addItem('A-1', 2)
    start()
    await waitFor(() => expect(bodies.length).toBeGreaterThanOrEqual(2))

    expect(bodies[0]).toMatchObject({ method: undefined, auth: `Bearer ${token}` })
    expect(bodies[1]).toMatchObject({
      method: 'PUT',
      url: expect.stringMatching(/\/api\/cart\/items\/A-1$/),
      body: { quantity: 2 },
      auth: `Bearer ${token}`,
    })
  })
})
