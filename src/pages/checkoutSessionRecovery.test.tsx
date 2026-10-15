import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { markSessionEnded } from '@/features/auth/sessionEnded'
import { useCartStore } from '@/features/cart/cartStore'
import { idempotencyKeyFor } from '@/features/orders/checkoutAttempt'
import {
  CHECKOUT_DRAFT_KEY,
  CHECKOUT_DRAFT_TTL_MS,
  peekCheckoutDraft,
  saveCheckoutDraft,
} from '@/features/orders/checkoutDraft'
import { openAccountMenu, signOutFromHeader } from '@/test/accountMenu'
import { setUpAuthApi } from '@/test/authApi'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

/**
 * A visitor whose session ends while they are on the checkout: they are sent to the login page and
 * told why, they come back to the checkout after signing in, and the delivery details they had typed
 * are there again (once, for that account only, never the "this is a demo" tick). Every other way
 * that the draft could be made, kept or shown is covered here as well, because a draft that is shown
 * to the wrong person, or restored without being asked, is worse than one that is lost.
 */
const api = setUpAuthApi()

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }
const DANA = { name: 'דנה', email: 'dana@example.com', password: 'Passw0rdOK' }

const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח', price: { current: 1000 } })
const gpu = makeProduct({ id: 'GPU-1', name: 'כרטיס מסך', price: { current: 750 } })
const catalog = [psu, gpu]

// The words are spelled out here, not imported: a change of wording is a decision, and fails a test.
const SESSION_ENDED_NOTICE = 'ההתחברות הסתיימה. התחברו שוב כדי להמשיך להזמנה.'
const RESTORED_NOTICE = 'שחזרנו את פרטי המשלוח שמילאתם. בדקו אותם ואשרו שוב שזו הזמנת הדגמה.'

beforeEach(() => api.setCatalog(catalog))

const url = () => screen.getByTestId('url').textContent
const box = (name: string) => screen.getByRole('textbox', { name })
const submitButton = () => screen.getByRole('button', { name: 'אישור הזמנה (הדגמה)' })
const demoTick = () => screen.getByRole('checkbox', { name: /הזמנת הדגמה/ })
/** The checkout, with its form drawn (the cart of the account may take a moment to arrive). */
async function checkoutHeading() {
  await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
  return screen.findByRole('textbox', { name: 'טלפון' })
}
const savedCartLines = () => [...api.carts().values()][0]?.items.length ?? 0
const storedDraft = () => sessionStorage.getItem(CHECKOUT_DRAFT_KEY)
const signedInUserId = () => useAuthStore.getState().user!.id

const TYPED = {
  phone: '050-1234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  houseNumber: '12',
}
/** What the form holds for them once the rules have written them (the phone number is written locally). */
const KEPT = {
  fullName: GOOD.name,
  email: GOOD.email,
  phone: '0501234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  houseNumber: '12',
  apartment: '',
  postalCode: '',
  notes: '',
}

async function typeDelivery() {
  await userEvent.type(box('טלפון'), TYPED.phone)
  await userEvent.type(box('עיר'), TYPED.city)
  await userEvent.type(box('רחוב'), TYPED.street)
  await userEvent.type(box('מספר בית'), TYPED.houseNumber)
}

async function fillAndTick() {
  await typeDelivery()
  await userEvent.click(demoTick())
}

/** Signs in through the login page, the way a visitor does. */
async function signInThroughThePage({ email, password } = GOOD) {
  await userEvent.type(await screen.findByRole('textbox', { name: 'אימייל' }), email)
  await userEvent.type(screen.getByLabelText(/^סיסמה/), password)
  await userEvent.click(screen.getByRole('button', { name: 'התחברות' }))
}

/** A signed-in account with two products in its cart, on the checkout with the form filled in. */
async function onTheFilledCheckout() {
  await useAuthStore.getState().register(GOOD)
  useCartStore.getState().addItem('PSU-1')
  useCartStore.getState().addItem('GPU-1')
  renderApp('/checkout', catalog)
  await checkoutHeading()
  await fillAndTick()
  await waitFor(() => expect(savedCartLines()).toBe(2))
}

/** The session ends on the server (an account signed out everywhere, say) and the visitor orders. */
async function orderAfterTheSessionEnded() {
  api.endAllSessions()
  await userEvent.click(submitButton())
  await waitFor(() => expect(url()).toBe('/login'))
}

/** Every order request is recorded (its key) and goes on to the API. */
function watchOrderKeys() {
  const keys: string[] = []
  const inner = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/api/orders') && init?.method === 'POST') {
      keys.push((init.headers as Record<string, string>)['Idempotency-Key']!)
    }
    return inner(input, init)
  })
  return keys
}

/** Every order request is answered with this status instead of reaching the API. */
function answerOrdersWith(status: number, code: string) {
  const inner = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).endsWith('/api/orders') && init?.method === 'POST'
      ? Promise.resolve(Response.json({ error: { code, message: 'x' } }, { status }))
      : inner(input, init),
  )
}

/** Opens the checkout from the cart page, the way a visitor does, after `before` has run. */
async function openCheckoutFromTheCart(before: () => void) {
  renderApp('/cart', catalog)
  await screen.findByRole('link', { name: 'מעבר לסיום ההזמנה' })
  before()
  await userEvent.click(screen.getByRole('link', { name: 'מעבר לסיום ההזמנה' }))
  await checkoutHeading()
}

describe('a session that ends on the checkout', () => {
  it('sends the visitor to the login page with the reason, and back to the checkout with the details, the cart and no tick', async () => {
    const keys = watchOrderKeys()
    await onTheFilledCheckout()

    await orderAfterTheSessionEnded()

    // Nothing was ordered, the visitor is told why they are here, and the details are waiting.
    expect(api.orders()).toHaveLength(0)
    expect(useAuthStore.getState().status).toBe('anonymous')
    expect(screen.getByText(SESSION_ENDED_NOTICE)).toBeInTheDocument()
    expect(storedDraft()).not.toBeNull()

    await signInThroughThePage()

    // Back on the checkout, with what they had typed, the cart of the account, and a tick to give again.
    expect(await checkoutHeading()).toBeInTheDocument()
    expect(url()).toBe('/checkout')
    expect(screen.getByText(RESTORED_NOTICE)).toBeInTheDocument()
    expect(box('שם מלא')).toHaveValue(KEPT.fullName)
    expect(box('אימייל')).toHaveValue(KEPT.email)
    expect(box('טלפון')).toHaveValue(KEPT.phone)
    expect(box('עיר')).toHaveValue(KEPT.city)
    expect(box('רחוב')).toHaveValue(KEPT.street)
    expect(box('מספר בית')).toHaveValue(KEPT.houseNumber)
    expect(demoTick()).not.toBeChecked()
    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(2))
    // The draft was used by opening the page: it is not in storage any more.
    expect(storedDraft()).toBeNull()
    expect(screen.queryByText(SESSION_ENDED_NOTICE)).not.toBeInTheDocument()

    // Without the tick no order is sent; with it, the order is the same attempt, once.
    await userEvent.click(submitButton())
    expect(await screen.findByText('יש לאשר שזו הזמנת הדגמה')).toBeInTheDocument()
    expect(keys).toHaveLength(1)
    expect(api.orders()).toHaveLength(0)

    await userEvent.click(demoTick())
    await userEvent.click(submitButton())

    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
    expect(api.orders()).toHaveLength(1)
    expect(api.orders()[0]!.delivery).toMatchObject({
      phone: KEPT.phone,
      city: KEPT.city,
      street: KEPT.street,
      houseNumber: KEPT.houseNumber,
    })
    expect(
      api
        .orders()[0]!
        .lines.map((line) => line.productId)
        .sort(),
    ).toEqual(['GPU-1', 'PSU-1'])
    // The refused attempt and the one that was placed are one attempt: one key, so never two orders.
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
    expect(storedDraft()).toBeNull()
  })

  it('keeps the delivery details and nothing else: not the tick, the token, the key of the attempt or the account', async () => {
    const keys = watchOrderKeys()
    await onTheFilledCheckout()
    const token = useAuthStore.getState().token!
    const userId = signedInUserId()

    await orderAfterTheSessionEnded()

    const raw = storedDraft()!
    const stored = JSON.parse(raw) as { details: Record<string, unknown> }
    expect(stored.details).toEqual(KEPT)
    expect(Object.keys(stored).sort()).toEqual(['details', 'owner', 'savedAt', 'version'])
    for (const secret of ['acceptDemo', token, keys[0]!, userId, GOOD.password]) {
      expect(raw).not.toContain(secret)
    }
    // And only in this tab.
    expect(localStorage.getItem(CHECKOUT_DRAFT_KEY)).toBeNull()
    expect(JSON.stringify({ ...localStorage })).not.toContain(KEPT.phone)
  })

  it('makes the draft before the visitor is signed out', async () => {
    await onTheFilledCheckout()
    const order: string[] = []
    const stop = useAuthStore.subscribe((state, previous) => {
      if (previous.user && !state.user) order.push(storedDraft() ? 'draft first' : 'no draft yet')
    })

    await orderAfterTheSessionEnded()
    stop()

    expect(order).toEqual(['draft first'])
  })

  it('does not tell a visitor who was simply not signed in that a session ended', async () => {
    renderApp('/checkout', catalog)

    await waitFor(() => expect(url()).toBe('/login'))

    expect(screen.queryByText(SESSION_ENDED_NOTICE)).not.toBeInTheDocument()
  })

  it('does not tell a visitor who is sent to the login page later that a session ended earlier', async () => {
    // A session ended a minute ago and the visitor did something else; nobody is signed in now.
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_800_000_000_000)
    markSessionEnded()
    now.mockReturnValue(1_800_000_000_000 + 60_000)

    renderApp('/checkout', catalog)

    await waitFor(() => expect(url()).toBe('/login'))
    expect(screen.queryByText(SESSION_ENDED_NOTICE)).not.toBeInTheDocument()
  })

  it('says it once: the next time the visitor is sent to the login page, it is not said again', async () => {
    markSessionEnded()
    renderApp('/checkout', catalog)
    await waitFor(() => expect(url()).toBe('/login'))
    expect(screen.getByText(SESSION_ENDED_NOTICE)).toBeInTheDocument()

    cleanup()
    renderApp('/checkout', catalog)

    await waitFor(() => expect(url()).toBe('/login'))
    expect(screen.queryByText(SESSION_ENDED_NOTICE)).not.toBeInTheDocument()
  })

  it('says the same when the session is found to be over as the checkout opens, and has no details to keep', async () => {
    await useAuthStore.getState().register(GOOD)
    useCartStore.getState().addItem('PSU-1')
    // An unresolved attempt: the checkout asks the API about it as it opens.
    idempotencyKeyFor(signedInUserId())
    api.endAllSessions()

    renderApp('/checkout', catalog)

    await waitFor(() => expect(url()).toBe('/login'))
    expect(await screen.findByText(SESSION_ENDED_NOTICE)).toBeInTheDocument()
    expect(storedDraft()).toBeNull()
  })

  it('finds no restored notice and a blank form when the same account signs in after nothing was kept', async () => {
    await useAuthStore.getState().register(GOOD)
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await checkoutHeading()

    expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument()
    expect(box('טלפון')).toHaveValue('')
    expect(box('עיר')).toHaveValue('')
  })
})

describe('what is not a session that ended', () => {
  it.each([
    ['a 503', 503, 'unavailable'],
    ['a 400', 400, 'invalid_input'],
    ['a 429', 429, 'too_many_requests'],
    ['a 409', 409, 'something_else'],
  ])('keeps nothing for %s', async (_what, status, code) => {
    answerOrdersWith(status, code)
    await onTheFilledCheckout()

    await userEvent.click(submitButton())

    await waitFor(() => expect(screen.queryByText('שולח…')).not.toBeInTheDocument())
    expect(url()).toBe('/checkout')
    expect(storedDraft()).toBeNull()
    expect(useAuthStore.getState().status).toBe('authenticated')
  })

  it('keeps nothing when the connection is lost', async () => {
    await onTheFilledCheckout()
    const inner = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/api/orders') && init?.method === 'POST') {
        return Promise.reject(new TypeError('network down'))
      }
      return inner(input, init)
    })

    await userEvent.click(submitButton())

    await waitFor(() => expect(screen.queryByText('שולח…')).not.toBeInTheDocument())
    expect(storedDraft()).toBeNull()
    expect(useAuthStore.getState().status).toBe('authenticated')
  })

  it('keeps nothing when the order is placed', async () => {
    await onTheFilledCheckout()

    await userEvent.click(submitButton())

    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
    expect(storedDraft()).toBeNull()
  })

  it('keeps nothing while the visitor types: a form that is only filled in leaves no trace', async () => {
    await onTheFilledCheckout()

    expect(storedDraft()).toBeNull()
  })
})

describe('signing out by choice', () => {
  const draftOf = () => saveCheckoutDraft(signedInUserId(), KEPT)

  it('removes the draft', async () => {
    await useAuthStore.getState().register(GOOD)
    renderApp('/products', catalog)
    await screen.findByRole('heading', { level: 1, name: 'כל המוצרים' })
    draftOf()
    expect(peekCheckoutDraft(signedInUserId())).not.toBeNull()

    await signOutFromHeader()

    await waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'))
    expect(storedDraft()).toBeNull()
  })

  it('removes the draft when signing out on the checkout itself', async () => {
    await useAuthStore.getState().register(GOOD)
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await checkoutHeading()
    draftOf()

    await signOutFromHeader()

    await waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'))
    expect(url()).toBe('/')
    expect(storedDraft()).toBeNull()
  })

  it('removes the draft when signing out of every device', async () => {
    await useAuthStore.getState().register(GOOD)
    renderApp('/products', catalog)
    await screen.findByRole('heading', { level: 1, name: 'כל המוצרים' })
    draftOf()

    const panel = await openAccountMenu()
    await userEvent.click(panel.getByRole('button', { name: 'התנתקות מכל המכשירים' }))

    await waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'))
    expect(storedDraft()).toBeNull()
  })

  it('leaves nothing for the same account to find when it signs in again', async () => {
    await onTheFilledCheckout()
    await orderAfterTheSessionEnded()
    // The visitor changes their mind and signs in later, from the login page, as the same account...
    await useAuthStore.getState().login({ email: GOOD.email, password: GOOD.password })
    await checkoutHeading()
    await signOutFromHeader()
    await waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'))

    // ...and the draft that was used and the sign-out that followed leave nothing behind.
    await useAuthStore.getState().login({ email: GOOD.email, password: GOOD.password })
    expect(storedDraft()).toBeNull()
  })
})

describe('another account', () => {
  it('does not get the details of the account whose session ended, and nobody finds them afterwards', async () => {
    await onTheFilledCheckout()
    await orderAfterTheSessionEnded()
    expect(storedDraft()).not.toBeNull()

    // Somebody else signs in on this login page (the destination is the checkout all the same).
    useCartStore.getState().addItem('PSU-1')
    await useAuthStore.getState().register(DANA)

    expect(storedDraft()).toBeNull()
    expect(await checkoutHeading()).toBeInTheDocument()
    expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument()
    expect(box('שם מלא')).toHaveValue(DANA.name)
    expect(box('אימייל')).toHaveValue(DANA.email)
    expect(box('טלפון')).toHaveValue('')
    expect(box('עיר')).toHaveValue('')
    expect(box('רחוב')).toHaveValue('')
    expect(box('מספר בית')).toHaveValue('')
    expect(document.body).not.toHaveTextContent(KEPT.street)

    // The first account comes back: what it had typed was not kept for it, and nothing is shown.
    await signOutFromHeader()
    await waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'))
    await useAuthStore.getState().login({ email: GOOD.email, password: GOOD.password })
    cleanup()
    renderApp('/checkout', catalog)
    await checkoutHeading()
    expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument()
    expect(box('טלפון')).toHaveValue('')
  })

  it('removes the details as the other account signs in, even if it never opens the checkout', async () => {
    await onTheFilledCheckout()
    await orderAfterTheSessionEnded()

    await useAuthStore.getState().register(DANA)

    expect(storedDraft()).toBeNull()
  })
})

describe('a draft that cannot be used', () => {
  /** The cart page is open and signed in; `write` puts something in storage; then the checkout opens. */
  async function checkoutWith(write: (userId: string) => void) {
    await useAuthStore.getState().register(GOOD)
    useCartStore.getState().addItem('PSU-1')
    await openCheckoutFromTheCart(() => write(signedInUserId()))
  }

  const blankForm = () => {
    expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument()
    expect(box('טלפון')).toHaveValue('')
    expect(box('עיר')).toHaveValue('')
    expect(box('רחוב')).toHaveValue('')
    expect(demoTick()).not.toBeChecked()
  }

  it('is used when it is good (the other cases here are about what spoils it)', async () => {
    await checkoutWith((userId) => saveCheckoutDraft(userId, KEPT))

    expect(screen.getByText(RESTORED_NOTICE)).toBeInTheDocument()
    expect(box('רחוב')).toHaveValue(KEPT.street)
  })

  it('is not used, and is removed, when it is older than 30 minutes, though nothing had removed it before', async () => {
    await checkoutWith((userId) => {
      saveCheckoutDraft(userId, KEPT)
      // Written back by hand with an old time: nothing cleans storage when it is changed like this,
      // so the checkout is what meets an old draft that is still there.
      const draft = JSON.parse(storedDraft()!)
      draft.savedAt = Date.now() - CHECKOUT_DRAFT_TTL_MS - 1
      sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft))
      expect(storedDraft()).not.toBeNull()
    })

    blankForm()
    expect(storedDraft()).toBeNull()
  })

  it('is not used, and is removed, when it is not JSON', async () => {
    await checkoutWith(() => sessionStorage.setItem(CHECKOUT_DRAFT_KEY, '{not json'))

    blankForm()
    expect(storedDraft()).toBeNull()
  })

  it('is not used, and is removed, when it holds a field that is not a delivery field', async () => {
    await checkoutWith((userId) => {
      saveCheckoutDraft(userId, KEPT)
      const draft = JSON.parse(storedDraft()!)
      draft.details.acceptDemo = true
      sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft))
    })

    blankForm()
    expect(storedDraft()).toBeNull()
  })

  it('is not used, and is removed, when the rules of an order refuse a value in it', async () => {
    await checkoutWith((userId) => {
      saveCheckoutDraft(userId, { ...KEPT, street: `דיזנגוף${String.fromCharCode(9)}12` })
    })

    blankForm()
    expect(storedDraft()).toBeNull()
  })

  it('is not used, and is removed, when it is another account that it was made for', async () => {
    await checkoutWith(() => saveCheckoutDraft('some-other-account', KEPT))

    blankForm()
    expect(storedDraft()).toBeNull()
  })
})

describe('old drafts are taken out of storage', () => {
  it('as the site opens on the login page, with nobody signed in', async () => {
    saveCheckoutDraft('some-account', KEPT, Date.now() - CHECKOUT_DRAFT_TTL_MS - 1)
    expect(storedDraft()).not.toBeNull()

    renderApp('/login', catalog)
    await screen.findByRole('heading', { level: 1, name: 'התחברות' })

    expect(storedDraft()).toBeNull()
  })

  it('and a draft that is still good stays on the login page, where it waits for the sign-in', async () => {
    saveCheckoutDraft('some-account', KEPT)

    renderApp('/login', catalog)
    await screen.findByRole('heading', { level: 1, name: 'התחברות' })

    expect(storedDraft()).not.toBeNull()
  })

  it('when the tab is shown again after the draft expired while it could not run a timer', async () => {
    const now = vi.spyOn(Date, 'now')
    const start = Date.now()
    renderApp('/login', catalog)
    await screen.findByRole('heading', { level: 1, name: 'התחברות' })
    saveCheckoutDraft('some-account', KEPT)
    expect(storedDraft()).not.toBeNull()

    now.mockReturnValue(start + CHECKOUT_DRAFT_TTL_MS + 60_000)
    expect(storedDraft()).not.toBeNull() // nothing has looked yet
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(storedDraft()).toBeNull()
  })
})

describe('using a draft once', () => {
  it('does not bring it back on a reload', async () => {
    await onTheFilledCheckout()
    await orderAfterTheSessionEnded()
    await signInThroughThePage()
    await checkoutHeading()
    expect(screen.getByText(RESTORED_NOTICE)).toBeInTheDocument()

    // The page is loaded again: the session is in storage, the draft is not.
    cleanup()
    renderApp('/checkout', catalog)
    await checkoutHeading()

    expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument()
    expect(box('טלפון')).toHaveValue('')
    expect(box('עיר')).toHaveValue('')
  })

  it('does not bring it back when the visitor goes to the cart and returns', async () => {
    await onTheFilledCheckout()
    await orderAfterTheSessionEnded()
    await signInThroughThePage()
    await checkoutHeading()
    expect(box('רחוב')).toHaveValue(KEPT.street)

    await userEvent.click(screen.getByRole('link', { name: 'חזרה לעגלה' }))
    await screen.findByRole('heading', { level: 1, name: 'עגלת קניות' })
    await userEvent.click(screen.getByRole('link', { name: 'מעבר לסיום ההזמנה' }))
    await checkoutHeading()

    expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument()
    expect(box('רחוב')).toHaveValue('')
  })

  it('does not bring it back with the Back button', async () => {
    await onTheFilledCheckout()
    await orderAfterTheSessionEnded()
    await signInThroughThePage()
    await checkoutHeading()
    await userEvent.click(screen.getByRole('link', { name: 'חזרה לעגלה' }))
    await screen.findByRole('heading', { level: 1, name: 'עגלת קניות' })

    await userEvent.click(screen.getByRole('button', { name: 'test-back', hidden: true }))
    await checkoutHeading()

    expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument()
    expect(box('רחוב')).toHaveValue('')
  })

  it('survives a reload of the login page, where it waits for the sign-in', async () => {
    await onTheFilledCheckout()
    const userId = signedInUserId()
    await orderAfterTheSessionEnded()

    // The login page is loaded again (the destination is lost with the state of this test router).
    cleanup()
    renderApp('/login', catalog)
    await screen.findByRole('heading', { level: 1, name: 'התחברות' })

    expect(storedDraft()).not.toBeNull()
    expect(peekCheckoutDraft(userId)).toEqual(KEPT)
  })

  it('is used up by the checkout of the account even when the cart is empty and there is no form', async () => {
    await useAuthStore.getState().register(GOOD)
    saveCheckoutDraft(signedInUserId(), KEPT)

    renderApp('/checkout', catalog)
    await screen.findByText('העגלה ריקה')

    expect(storedDraft()).toBeNull()
  })
})

describe('the order that is placed from a restored form', () => {
  it('is checked like any other: a value that is changed to one the rules refuse is not sent', async () => {
    const keys = watchOrderKeys()
    await onTheFilledCheckout()
    await orderAfterTheSessionEnded()
    await signInThroughThePage()
    await checkoutHeading()
    await userEvent.click(demoTick())
    await userEvent.clear(box('עיר'))
    await userEvent.type(box('עיר'), '<b>')

    await userEvent.click(submitButton())

    expect(
      await within(screen.getByRole('main')).findByText(/מכיל תווים שאינם מותרים/),
    ).toBeVisible()
    expect(keys).toHaveLength(1) // only the refused one, from before
    expect(api.orders()).toHaveLength(0)
  })
})
