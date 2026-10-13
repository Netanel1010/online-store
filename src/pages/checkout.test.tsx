import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { setServerLine } from '@/features/cart/cartService'
import { useCartStore } from '@/features/cart/cartStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { SEPARATE_ORDER_QUESTION } from '@/features/orders/OrderAttemptNotice'
import { makeProduct } from '@/test/fixtures'
import { setUpAuthApi } from '@/test/authApi'
import { signOutFromHeader } from '@/test/accountMenu'
import { renderApp } from '@/test/renderApp'

// The real authentication and orders API answers these tests (see setUpAuthApi).
const api = setUpAuthApi()

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }

const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח', price: { current: 1000 } })
const gpu = makeProduct({
  id: 'GPU-1',
  name: 'כרטיס מסך',
  price: { current: 750, original: 1000 },
})
const catalog = [psu, gpu]

// The API prices an order from its own products: the ones the page shows, unless a test says otherwise.
beforeEach(() => api.setCatalog(catalog))

const url = () => screen.getByTestId('url').textContent
const summary = () => screen.getByRole('complementary', { name: 'סיכום הזמנה' })
const total = () => within(summary()).getByText('סה"כ').nextElementSibling

const box = (name: string) => screen.getByRole('textbox', { name })
const submitButton = () => screen.getByRole('button', { name: 'אישור הזמנה (הדגמה)' })

const signIn = () => useAuthStore.getState().register(GOOD)

/** How many lines the API holds in the cart of the (only) account: the cart is sent as it is changed. */
const savedCartLines = () => [...api.carts().values()][0]?.items.length ?? 0

async function fillValidForm({ phone = '050-1234567' } = {}) {
  await userEvent.type(box('טלפון'), phone)
  await userEvent.type(box('עיר'), 'תל אביב')
  await userEvent.type(box('רחוב'), 'דיזנגוף')
  await userEvent.type(box('מספר בית'), '12')
  await userEvent.click(screen.getByRole('checkbox', { name: /הזמנת הדגמה/ }))
}

/** An order request, as the API received it. */
const isOrderRequest = (input: RequestInfo | URL, init?: RequestInit) =>
  String(input).endsWith('/api/orders') && init?.method === 'POST'

/**
 * Records the order requests of the page (their keys and bodies). "fail-first" makes the first one
 * fail before it reaches the API; "lose-first-answer" lets the API place the order and then loses
 * its answer, which is what a timeout on a slow host looks like.
 */
function watchOrderRequests(behavior?: 'fail-first' | 'lose-first-answer') {
  const seen: { key: string; body: unknown }[] = []
  const inner = globalThis.fetch
  let first = true
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isOrderRequest(input, init)) return inner(input, init)
    const headers = init?.headers as Record<string, string>
    seen.push({ key: headers['Idempotency-Key']!, body: JSON.parse(init?.body as string) })
    const failing = first && behavior !== undefined
    first = false
    if (failing && behavior === 'fail-first') throw new TypeError('network down')
    const response = await inner(input, init)
    if (failing) throw new TypeError('the answer was lost')
    return response
  })
  return { keys: () => seen.map((request) => request.key), bodies: () => seen.map((r) => r.body) }
}

/** Every order request is answered with this status instead of reaching the API. */
function answerOrderRequestsWith(status: number, code = 'x') {
  const inner = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    isOrderRequest(input, init)
      ? Promise.resolve(Response.json({ error: { code, message: 'x' } }, { status }))
      : inner(input, init),
  )
}

const isLookupRequest = (input: RequestInfo | URL, init?: RequestInit) =>
  String(input).endsWith('/api/orders/lookup') && init?.method === 'POST'

/**
 * Counts the questions the page asks about an earlier attempt. With `answer`, the API is made to
 * answer them with that status and error code instead (an API that does not have the route yet
 * answers 404 `not_found`).
 */
function watchLookups(answer?: { status: number; code: string }) {
  const seen: { url: string; body: { idempotencyKey: string } }[] = []
  const inner = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isLookupRequest(input, init)) return inner(input, init)
    seen.push({ url: String(input), body: JSON.parse(init?.body as string) })
    return answer
      ? Promise.resolve(
          Response.json({ error: { code: answer.code, message: 'x' } }, { status: answer.status }),
        )
      : inner(input, init)
  })
  return { count: () => seen.length, requests: () => seen }
}

/**
 * Holds every order request until `release()`; the API sees it only then. With `loseAnswer`, the API
 * then makes the order and the answer never reaches the page (a timeout on a slow host).
 */
function holdOrderRequests({ loseAnswer = false } = {}) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const inner = globalThis.fetch
  let count = 0
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isOrderRequest(input, init)) return inner(input, init)
    count += 1
    await gate
    const response = await inner(input, init)
    if (loseAnswer) throw new TypeError('the answer was lost')
    return response
  })
  return { release: () => release(), count: () => count }
}

describe('checkout is protected', () => {
  it('sends a signed-out visitor to the login page and returns to checkout after signing in', async () => {
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)

    await waitFor(() => expect(url()).toBe('/login'))
    expect(screen.queryByRole('heading', { name: 'סיום הזמנה' })).not.toBeInTheDocument()

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'אימייל' }),
      'someone@example.com',
    )
    await userEvent.type(screen.getByLabelText(/^סיסמה/), 'whatever1')
    // No such account yet: register one through the link, which keeps the destination.
    await userEvent.click(screen.getByRole('link', { name: 'הרשמה' }))
    await userEvent.type(await screen.findByRole('textbox', { name: 'שם' }), GOOD.name)
    await userEvent.type(screen.getByRole('textbox', { name: 'אימייל' }), GOOD.email)
    await userEvent.type(screen.getByLabelText(/^סיסמה/), GOOD.password)
    await userEvent.type(screen.getByLabelText(/^אימות סיסמה/), GOOD.password)
    await userEvent.click(screen.getByRole('button', { name: 'יצירת חשבון' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeInTheDocument()
    expect(url()).toBe('/checkout')
  })

  it('sends a signed-out visitor away from the confirmation page too', async () => {
    renderApp('/orders/DEMO-ABCDEFGH', catalog)

    await waitFor(() => expect(url()).toBe('/login'))
  })

  it('shows the cart page checkout button to everyone, with a hint when signed out', async () => {
    useCartStore.getState().addItem('PSU-1')
    renderApp('/cart', catalog)

    const link = await screen.findByRole('link', { name: 'מעבר לסיום ההזמנה' })
    expect(link).toHaveAttribute('href', '/checkout')
    expect(screen.getByText('כדי להמשיך תתבקשו להתחבר או להירשם.')).toBeInTheDocument()
  })

  it('leads a signed-in visitor from the cart straight to checkout', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/cart', catalog)

    expect(screen.queryByText('כדי להמשיך תתבקשו להתחבר או להירשם.')).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('link', { name: 'מעבר לסיום ההזמנה' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeInTheDocument()
  })

  it('returns a signed-out visitor to the home page, not the login page, when signing out on checkout', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await signOutFromHeader()

    await waitFor(() => expect(url()).toBe('/'))
  })
})

describe('checkout with an empty cart', () => {
  it('shows an empty state instead of the form', async () => {
    await signIn()
    renderApp('/checkout', catalog)

    expect(await screen.findByText('העגלה ריקה')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')
    expect(screen.queryByRole('button', { name: 'אישור הזמנה (הדגמה)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'טלפון' })).not.toBeInTheDocument()
  })

  it('waits for the cart of the account, on a browser that has none, before saying the cart is empty', async () => {
    await signIn()
    await setServerLine(useAuthStore.getState().token!, 'PSU-1', 1)
    let answer: () => void = () => undefined
    const slow = new Promise<void>((resolve) => {
      answer = resolve
    })
    const inner = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/api/cart') && init?.method === undefined) await slow
      return inner(input, init)
    })

    renderApp('/checkout', catalog)
    await act(async () => {})
    expect(screen.queryByText('העגלה ריקה')).not.toBeInTheDocument()

    answer()

    expect(await screen.findByRole('textbox', { name: 'טלפון' })).toBeInTheDocument()
    expect(screen.queryByText('העגלה ריקה')).not.toBeInTheDocument()
  })

  it('treats a cart of products that no longer exist as empty', async () => {
    await signIn()
    useCartStore.getState().addItem('GONE')
    renderApp('/checkout', catalog)

    expect(await screen.findByText('העגלה ריקה')).toBeInTheDocument()
  })

  it('shows an error with retry when the catalog cannot be loaded', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', new Error('down'))

    expect(await screen.findByRole('alert')).toHaveTextContent('משהו השתבש')
    expect(useCartStore.getState().items).toHaveLength(1) // nothing was lost
  })
})

describe('checkout order summary', () => {
  it('lists the cart lines and calculates the totals from the cart and the catalog', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    useCartStore.getState().addItem('GPU-1', 2)
    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    const lines = screen.getByRole('list', { name: 'המוצרים בהזמנה' })
    expect(within(lines).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lines).getByText('כמות: 2')).toBeInTheDocument()

    // 1 x 1,000 + 2 x 750 = 2,500; before discounts 1 x 1,000 + 2 x 1,000 = 3,000.
    expect(within(summary()).getByText('מספר פריטים').nextElementSibling).toHaveTextContent('3')
    expect(total()).toHaveTextContent(/2,500/)
    expect(within(summary()).getByText('מחיר לפני הנחות').nextElementSibling).toHaveTextContent(
      /3,000/,
    )
    expect(within(summary()).getByText('חיסכון').nextElementSibling).toHaveTextContent(/500/)
  })

  it('does not invent shipping, VAT or payment amounts', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    expect(summary()).toHaveTextContent('לא מחושבים משלוח ומע"מ, ולא מתבצע תשלום')
    expect(within(summary()).queryByText(/משלוח:|מע"מ:/)).not.toBeInTheDocument()
    expect(total()).toHaveTextContent(/1,000/)
  })

  it('shows the same totals as the cart page', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1', 2)
    useCartStore.getState().addItem('GPU-1')
    const cart = renderApp('/cart', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })
    const cartTotal = total()?.textContent
    cart.unmount()

    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    expect(total()?.textContent).toBe(cartTotal)
    expect(cartTotal).toMatch(/2,750/)
  })

  it('prefills the name and email of the signed-in visitor', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    expect(box('שם מלא')).toHaveValue(GOOD.name)
    expect(box('אימייל')).toHaveValue(GOOD.email)
  })

  describe('says that this is a demo order', () => {
    beforeEach(async () => {
      await signIn()
      useCartStore.getState().addItem('PSU-1')
    })

    it('at the top: no real payment, no product, and an address that is only checked for its shape', async () => {
      renderApp('/checkout', catalog)

      const note = await screen.findByRole('complementary', { name: 'הערה' })
      expect(note).toHaveTextContent('זו הזמנת הדגמה בלבד')
      expect(note).toHaveTextContent('לא מתבצע תשלום אמיתי')
      expect(note).toHaveTextContent('לא יישלח שום מוצר')
      expect(note).toHaveTextContent('הכתובת נבדקת רק לפי הפורמט, ולא נבדק שהיא קיימת')
      expect(note).toHaveTextContent('נשמרים בחשבון שלכם בשרת האתר')
    })

    it('under the address heading, where the address group is described by it', async () => {
      renderApp('/checkout', catalog)
      await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

      expect(screen.getByRole('group', { name: 'כתובת למשלוח' })).toHaveAccessibleDescription(
        'כתובת הדגמה: הכתובת נשמרת כחלק מההזמנה לצורכי הדגמה בלבד. לא יתבצע משלוח.',
      )
    })

    it('in the box the visitor must tick before the order is placed', async () => {
      renderApp('/checkout', catalog)
      await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

      expect(
        screen.getByRole('checkbox', {
          name: 'אני מבין/ה שזו הזמנת הדגמה בלבד: לא מתבצע תשלום אמיתי, לא יישלח מוצר, ופרטי המשלוח שהזנתי נשמרים בחשבון שלי.',
        }),
      ).not.toBeChecked()
    })

    it('and the button says so too, without asking for any payment detail', async () => {
      renderApp('/checkout', catalog)
      await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

      expect(submitButton()).toBeInTheDocument()
      expect(
        screen.queryByRole('textbox', { name: /אשראי|כרטיס|CVV|תשלום|חיוב/ }),
      ).not.toBeInTheDocument()
    })

    it('and does not promise a delivery, a courier or a date', async () => {
      renderApp('/checkout', catalog)
      await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

      const form = submitButton().closest('form')!
      expect(form).not.toHaveTextContent(/יגיע|שליח|מועד אספקה|זמן אספקה|ימי עסקים|מעקב/)
    })
  })
})

describe('invalid checkout submission', () => {
  beforeEach(async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    useFavoritesStore.getState().toggle('GPU-1')
  })

  it('reports every missing field, focuses the first and places no order', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await userEvent.click(submitButton())

    expect(await screen.findByText('יש להזין מספר טלפון')).toBeInTheDocument()
    expect(screen.getByText('יש להזין עיר')).toBeInTheDocument()
    expect(screen.getByText('יש להזין רחוב')).toBeInTheDocument()
    expect(screen.getByText('יש להזין מספר בית')).toBeInTheDocument()
    expect(screen.getByText('יש לאשר שזו הזמנת הדגמה')).toBeInTheDocument()
    expect(box('טלפון')).toHaveFocus() // name and email are prefilled, so phone is first
    expect(box('טלפון')).toHaveAttribute('aria-invalid', 'true')
    expect(url()).toBe('/checkout')
    expect(useCartStore.getState().items).toEqual([{ productId: 'PSU-1', quantity: 1 }])
  })

  it('rejects a bad phone number and a bad postal code', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm({ phone: '12345' })
    await userEvent.type(box('מיקוד (לא חובה)'), '123')
    await userEvent.click(submitButton())

    expect(await screen.findByText('מספר הטלפון אינו תקין')).toBeInTheDocument()
    expect(screen.getByText('המיקוד חייב להכיל 7 ספרות')).toBeInTheDocument()
    expect(url()).toBe('/checkout')
  })

  it('does not submit when the demo acknowledgement is not ticked', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await userEvent.type(box('טלפון'), '0501234567')
    await userEvent.type(box('עיר'), 'חיפה')
    await userEvent.type(box('רחוב'), 'הנמל')
    await userEvent.type(box('מספר בית'), '1')
    await userEvent.click(submitButton())

    expect(await screen.findByText('יש לאשר שזו הזמנת הדגמה')).toBeInTheDocument()
    expect(url()).toBe('/checkout')
  })

  it('keeps the cart and the form, and says so, when the API cannot be reached', async () => {
    const sent = watchOrderRequests('fail-first')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו להשלים את ההזמנה')
    expect(screen.getByRole('alert')).toHaveTextContent('לא תיווצר הזמנה כפולה')
    expect(url()).toBe('/checkout')
    expect(useCartStore.getState().items).toEqual([{ productId: 'PSU-1', quantity: 1 }])
    expect(box('עיר')).toHaveValue('תל אביב')
    expect(api.orders()).toHaveLength(0)
    expect(sent.keys()).toHaveLength(1)
  })

  it.each([
    [429, 'ניסיתם להזמין יותר מדי פעמים'],
    [500, 'לא הצלחנו להשלים את ההזמנה'],
    [400, 'השרת לא קיבל את פרטי ההזמנה'],
  ])('explains a %i answer and keeps the cart', async (status, message) => {
    answerOrderRequestsWith(status)
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(url()).toBe('/checkout')
    expect(useCartStore.getState().items).toEqual([{ productId: 'PSU-1', quantity: 1 }])
  })
})

describe('placing the order', () => {
  beforeEach(async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    useCartStore.getState().addItem('GPU-1', 2)
    useFavoritesStore.getState().toggle('GPU-1')
  })

  it('places the order with the API, opens its page, and empties the cart only', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' }),
    ).toBeInTheDocument()
    const [stored] = api.orders()
    expect(api.orders()).toHaveLength(1)
    expect(url()).toBe(`/orders/${stored!.orderNumber}`)
    expect(screen.getByText(stored!.orderNumber)).toBeInTheDocument()

    // What was ordered, and the amounts, are the API's: 1,000 + 2 x 750.
    const lines = screen.getByRole('list', { name: 'המוצרים שהוזמנו' })
    expect(within(lines).getAllByRole('listitem')).toHaveLength(2)
    expect(total()).toHaveTextContent(/2,500/)
    expect(stored).toMatchObject({ userId: expect.any(String), total: 2500, savings: 500 })

    // The cart is emptied; the favorites and the session are untouched.
    expect(useCartStore.getState().items).toEqual([])
    expect(useFavoritesStore.getState().ids).toEqual(['GPU-1'])
    expect(useAuthStore.getState().status).toBe('authenticated')
  })

  it('sends the cart as ids and quantities, the delivery details, and the total that was shown', async () => {
    const sent = watchOrderRequests()
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())
    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })

    expect(sent.bodies()).toEqual([
      {
        items: [
          { productId: 'PSU-1', quantity: 1 },
          { productId: 'GPU-1', quantity: 2 },
        ],
        delivery: {
          fullName: GOOD.name,
          email: GOOD.email,
          phone: '0501234567',
          city: 'תל אביב',
          street: 'דיזנגוף',
          houseNumber: '12',
          apartment: '',
          postalCode: '',
          notes: '',
        },
        expectedTotal: 2500,
      },
    ])
    // The tick box is the visitor's, not part of the order.
    expect(JSON.stringify(sent.bodies())).not.toContain('acceptDemo')
  })

  it('sends an Idempotency-Key, and forgets it once the order exists', async () => {
    const sent = watchOrderRequests()
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())
    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })

    expect(sent.keys()).toHaveLength(1)
    expect(sent.keys()[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(localStorage.getItem('online-store:checkout-attempt')).toBeNull()
  })

  it('makes one order when the button is clicked twice', async () => {
    const sent = watchOrderRequests()
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.dblClick(submitButton())
    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })

    expect(api.orders()).toHaveLength(1)
    expect(new Set(sent.keys()).size).toBe(1)
  })

  it('retries with the same key after a failure, and makes one order', async () => {
    const sent = watchOrderRequests('fail-first')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await fillValidForm()

    await userEvent.click(submitButton())
    await screen.findByRole('alert')
    await userEvent.click(submitButton())

    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
    expect(sent.keys()).toHaveLength(2)
    expect(sent.keys()[1]).toBe(sent.keys()[0])
    expect(api.orders()).toHaveLength(1)
  })

  it('does not make a second order when the first one was placed but its answer was lost', async () => {
    const sent = watchOrderRequests('lose-first-answer')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await fillValidForm()

    await userEvent.click(submitButton())
    await screen.findByRole('alert')
    expect(api.orders()).toHaveLength(1) // the API did place it, and the page does not know
    await userEvent.click(submitButton())

    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
    expect(sent.keys()[1]).toBe(sent.keys()[0])
    expect(api.orders()).toHaveLength(1)
    expect(url()).toBe(`/orders/${api.orders()[0]!.orderNumber}`)
    expect(useCartStore.getState().items).toEqual([])
  })

  it('keeps the key of an attempt that is not resolved when the cart changes, and still places the changed order', async () => {
    const sent = watchOrderRequests('fail-first')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await fillValidForm()
    await userEvent.click(submitButton())
    await screen.findByRole('alert')

    useCartStore.getState().setQuantity('PSU-1', 3) // the request never arrived: this is the order
    await userEvent.click(submitButton())

    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
    // The API knows whether the key made an order; it made none, so the changed order is placed.
    expect(sent.keys()[1]).toBe(sent.keys()[0])
    expect(api.orders()).toHaveLength(1)
    expect(api.orders()[0]!.lines.find((line) => line.productId === 'PSU-1')!.quantity).toBe(3)
  })

  it('uses the price the API has, not the one the page showed, and says so first', async () => {
    api.setCatalog([{ ...psu, price: { current: 1200 } }, gpu])
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    expect(total()).toHaveTextContent(/2,500/)
    await fillValidForm()

    await userEvent.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('המחיר השתנה')
    expect(alert).toHaveTextContent(/2,700/)
    expect(api.orders()).toHaveLength(0)
    expect(url()).toBe('/checkout')
    expect(useCartStore.getState().items).toHaveLength(2)

    // The visitor has seen the new total: ordering again accepts exactly that.
    await userEvent.click(submitButton())
    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
    expect(api.orders()).toHaveLength(1)
    expect(api.orders()[0]!.total).toBe(2700)
    expect(total()).toHaveTextContent(/2,700/)
  })

  it('refuses the order, names the product, and lets the visitor remove it from the cart', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await fillValidForm()
    await waitFor(() => expect(savedCartLines()).toBe(2)) // the account's cart has both
    api.setCatalog([psu]) // and then the API no longer has the graphics card

    await userEvent.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('אינם זמינים עוד')
    expect(alert).toHaveTextContent('כרטיס מסך')
    expect(api.orders()).toHaveLength(0)
    expect(useCartStore.getState().items).toHaveLength(2) // nothing was removed for them

    await userEvent.click(within(alert).getByRole('button', { name: 'הסרה מהעגלה' }))

    expect(useCartStore.getState().items).toEqual([{ productId: 'PSU-1', quantity: 1 }])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(submitButton())
    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
    expect(api.orders()[0]!.lines.map((line) => line.productId)).toEqual(['PSU-1'])
  })

  it('signs the visitor out, and sends them to log in again, when the API no longer knows the session', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await fillValidForm()
    await waitFor(() => expect(savedCartLines()).toBe(2))
    api.endAllSessions() // ended elsewhere, a moment ago

    await userEvent.click(submitButton())

    await waitFor(() => expect(url()).toBe('/login'))
    expect(useAuthStore.getState().status).toBe('anonymous')
    expect(api.orders()).toHaveLength(0)
    // Nobody is signed in, so this browser holds no cart; the account keeps it, and it comes back with the login.
    expect(useCartStore.getState().items).toHaveLength(0)
    expect(savedCartLines()).toBe(2)
    await useAuthStore.getState().login({ email: GOOD.email, password: GOOD.password })
    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(2))
  })

  it('says again that nothing was charged, and that the order is saved in the account', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())

    // Wait for the order page first: until then the note on the screen is the checkout's own.
    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
    const note = screen.getByRole('complementary', { name: 'הערה' })
    expect(note).toHaveTextContent('זו הייתה הזמנת הדגמה בלבד')
    expect(note).toHaveTextContent('לא בוצע תשלום אמיתי')
    // The heading right after ordering is the demo's, and nothing on the page says "received".
    expect(document.body).not.toHaveTextContent('התקבלה')
    expect(note).toHaveTextContent('נשמרו בחשבון שלכם')
    expect(note).not.toHaveTextContent('אינה נשמרת')
  })

  it('offers the next steps from the order page', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('link', { name: 'המשך קנייה' })).toHaveAttribute(
      'href',
      '/products',
    )
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')
  })
})

describe('an order whose answer was lost', () => {
  beforeEach(async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    useCartStore.getState().addItem('GPU-1', 2)
  })

  const recoveryNotice = () => screen.getByRole('alert')
  const editStreet = async (street: string) => {
    await userEvent.clear(box('רחוב'))
    await userEvent.type(box('רחוב'), street)
  }
  const separateOrderButton = () =>
    screen.getByRole('button', { name: 'הזמנה נפרדת בפרטים שהזנתי עכשיו' })

  /** The first request reaches the API and makes the order; its answer is lost. */
  async function loseTheFirstAnswer() {
    const sent = watchOrderRequests('lose-first-answer')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await fillValidForm()
    await userEvent.click(submitButton())
    await screen.findByRole('alert')
    expect(api.orders()).toHaveLength(1)
    return sent
  }

  /** The visitor edits the street and sends again: the API says an order exists. */
  async function editAndSendAgain() {
    await editStreet('אלנבי')
    await userEvent.click(submitButton())
    await waitFor(() => expect(recoveryNotice()).toHaveTextContent('כבר נקלטה'))
  }

  describe('and the visitor edits the details before sending again', () => {
    it('makes no second order, and shows the order that exists', async () => {
      const sent = await loseTheFirstAnswer()
      const [placed] = api.orders()

      await editAndSendAgain()

      expect(api.orders()).toHaveLength(1)
      expect(sent.keys()).toHaveLength(2)
      expect(sent.keys()[1]).toBe(sent.keys()[0])
      expect(recoveryNotice()).toHaveTextContent(placed!.orderNumber)
      expect(url()).toBe('/checkout')
    })

    it('does not discard the edit: the form keeps it, and the notice says it was not applied', async () => {
      await loseTheFirstAnswer()

      await editAndSendAgain()

      expect(box('רחוב')).toHaveValue('אלנבי')
      expect(recoveryNotice()).toHaveTextContent('אי אפשר לעדכן הזמנה קיימת')
      expect(recoveryNotice()).toHaveTextContent('לא שלחנו את הפרטים החדשים')
      // The order that exists keeps the details it was placed with.
      expect(api.orders()[0]!.delivery.street).toBe('דיזנגוף')
    })

    it('keeps the cart until an order is confirmed, and viewing the order does not change it', async () => {
      await loseTheFirstAnswer()
      const cart = useCartStore.getState().items
      expect(cart).toHaveLength(2)

      await editAndSendAgain()
      expect(useCartStore.getState().items).toEqual(cart)

      const link = screen.getByRole('link', { name: 'הצגת ההזמנה' })
      expect(link).toHaveAttribute('href', `/orders/${api.orders()[0]!.orderNumber}`)
      await userEvent.click(link)

      // Opened from the notice, not just placed: the page of the order, not the confirmation.
      await screen.findByRole('heading', { level: 1, name: 'פרטי הזמנה' })
      expect(useCartStore.getState().items).toEqual(cart)
      // The attempt is still unresolved: the key is kept, so nothing can place the order twice.
      expect(localStorage.getItem('online-store:checkout-attempt')).not.toBeNull()
    })

    it('asks before it places another order, and places nothing on its own', async () => {
      const sent = await loseTheFirstAnswer()
      await editAndSendAgain()

      await userEvent.click(separateOrderButton())

      expect(screen.getByText(SEPARATE_ORDER_QUESTION)).toBeInTheDocument()
      expect(sent.keys()).toHaveLength(2)
      expect(api.orders()).toHaveLength(1)

      await userEvent.click(screen.getByRole('button', { name: 'ביטול' }))

      expect(screen.queryByText(SEPARATE_ORDER_QUESTION)).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'הצגת ההזמנה' })).toBeInTheDocument()
      expect(sent.keys()).toHaveLength(2)
      expect(api.orders()).toHaveLength(1)
    })

    it('places a separate order, with the new details and a key of its own, once confirmed', async () => {
      const sent = await loseTheFirstAnswer()
      await editAndSendAgain()
      await userEvent.click(separateOrderButton())

      await userEvent.click(screen.getByRole('button', { name: 'כן, ליצור הזמנה חדשה' }))

      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
      expect(api.orders()).toHaveLength(2)
      expect(sent.keys()[2]).not.toBe(sent.keys()[0])
      expect(api.orders()[1]!.delivery.street).toBe('אלנבי')
      expect(useCartStore.getState().items).toEqual([])
      expect(localStorage.getItem('online-store:checkout-attempt')).toBeNull()
    })

    it('sends nothing, and keeps the earlier key, when the form is invalid at the moment of confirming', async () => {
      const sent = await loseTheFirstAnswer()
      await editAndSendAgain()
      await userEvent.clear(box('עיר'))
      await userEvent.click(separateOrderButton())

      await userEvent.click(screen.getByRole('button', { name: 'כן, ליצור הזמנה חדשה' }))

      // The form is checked first, so nothing was sent.
      expect(sent.keys()).toHaveLength(2)
      expect(api.orders()).toHaveLength(1)
    })
  })

  describe('and the visitor reloads the page', () => {
    it('finds the order on its own, before anything is sent, and makes no second order', async () => {
      const sent = await loseTheFirstAnswer()
      cleanup()
      const lookups = watchLookups()

      renderApp('/checkout', catalog)

      await waitFor(() => expect(recoveryNotice()).toHaveTextContent('כבר נקלטה'))
      expect(recoveryNotice()).toHaveTextContent(api.orders()[0]!.orderNumber)
      expect(recoveryNotice()).toHaveTextContent('בדקו אותה לפני שתמשיכו')
      expect(sent.keys()).toHaveLength(1)
      expect(api.orders()).toHaveLength(1)
      // The key travels in the body: it is in no address.
      expect(lookups.count()).toBe(1)
      expect(lookups.requests()[0]!.url).not.toContain(sent.keys()[0]!)
      expect(lookups.requests()[0]!.body).toEqual({ idempotencyKey: sent.keys()[0] })
    })

    it('completes with the same order when the details are sent again unchanged', async () => {
      const sent = await loseTheFirstAnswer()
      cleanup()
      renderApp('/checkout', catalog)
      await waitFor(() => expect(recoveryNotice()).toHaveTextContent('כבר נקלטה'))

      await fillValidForm()
      await userEvent.click(submitButton())

      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
      expect(sent.keys()[1]).toBe(sent.keys()[0])
      expect(api.orders()).toHaveLength(1)
      expect(url()).toBe(`/orders/${api.orders()[0]!.orderNumber}`)
      expect(useCartStore.getState().items).toEqual([])
      expect(localStorage.getItem('online-store:checkout-attempt')).toBeNull()
    })

    it('shows nothing when the earlier request never arrived, and the edited order is placed', async () => {
      const sent = watchOrderRequests('fail-first')
      renderApp('/checkout', catalog)
      await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
      await fillValidForm()
      await userEvent.click(submitButton())
      await screen.findByRole('alert')
      expect(api.orders()).toHaveLength(0)
      cleanup()
      const lookups = watchLookups()

      renderApp('/checkout', catalog)
      await waitFor(() => expect(lookups.count()).toBe(1))
      await screen.findByRole('textbox', { name: 'טלפון' })
      await act(() => new Promise((resolve) => setTimeout(resolve, 30)))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      await fillValidForm()
      await editStreet('אלנבי')
      await userEvent.click(submitButton())

      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
      expect(api.orders()).toHaveLength(1)
      expect(api.orders()[0]!.delivery.street).toBe('אלנבי')
      expect(sent.keys()[1]).toBe(sent.keys()[0])
    })

    it('asks nothing when there is no unresolved attempt', async () => {
      const lookups = watchLookups()
      renderApp('/checkout', catalog)
      await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
      await act(() => new Promise((resolve) => setTimeout(resolve, 30)))

      expect(lookups.count()).toBe(0)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('and another account signs in on the same browser', () => {
    /** The id of the account that signed in second: its cart is kept apart from the first account's. */
    const danaId = () => [...api.accounts().values()].find((user) => user.email === DANA.email)!.id
    const DANA = { name: 'דנה', email: 'dana@example.com', password: 'Passw0rdOK' }

    it('keeps the unresolved attempt of the first account, and finds its order when it comes back', async () => {
      const sent = await loseTheFirstAnswer()
      const [firstOrder] = api.orders()
      cleanup()

      // Another account signs in on this browser and places an order of its own.
      await useAuthStore.getState().register(DANA)
      renderApp('/checkout', catalog)
      expect(await screen.findByText('העגלה ריקה')).toBeInTheDocument()
      act(() => useCartStore.getState().addItem('PSU-1'))
      await screen.findByRole('textbox', { name: 'טלפון' })
      await waitFor(() => expect(api.carts().has(danaId())).toBe(true))
      await fillValidForm()
      await userEvent.click(submitButton())
      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
      expect(api.orders()).toHaveLength(2)
      expect(sent.keys()[1]).not.toBe(sent.keys()[0])
      // The emptied cart reaches the account before the page goes.
      await waitFor(() => expect(api.carts().has(danaId())).toBe(false))
      cleanup()

      // The first account comes back: its attempt is still unresolved, with its own key.
      const lookups = watchLookups()
      await useAuthStore.getState().login({ email: GOOD.email, password: GOOD.password })
      renderApp('/checkout', catalog)

      await waitFor(() => expect(recoveryNotice()).toHaveTextContent('כבר נקלטה'))
      expect(recoveryNotice()).toHaveTextContent(firstOrder!.orderNumber)
      expect(lookups.requests()[0]!.body).toEqual({ idempotencyKey: sent.keys()[0] })
      expect(api.orders()).toHaveLength(2)
    })

    it('does not show the first account order to the account that signs in on the page', async () => {
      await loseTheFirstAnswer()
      await editAndSendAgain()
      const { orderNumber } = api.orders()[0]!

      // Another account takes the page over without leaving it, and has something to order.
      await useAuthStore.getState().register(DANA)
      act(() => useCartStore.getState().addItem('GPU-1'))
      await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1))

      // The form is there for the new account, and nothing of the first account's is on it.
      expect(await screen.findByRole('textbox', { name: 'טלפון' })).toHaveValue('')
      expect(screen.queryByText(/כבר נקלטה/)).not.toBeInTheDocument()
      expect(screen.queryByText(orderNumber)).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('sends the first account own key again when it retries after the other account ordered', async () => {
      const sent = await loseTheFirstAnswer()
      cleanup()
      await useAuthStore.getState().register(DANA)
      renderApp('/checkout', catalog)
      expect(await screen.findByText('העגלה ריקה')).toBeInTheDocument()
      act(() => useCartStore.getState().addItem('PSU-1'))
      await screen.findByRole('textbox', { name: 'טלפון' })
      await waitFor(() => expect(api.carts().has(danaId())).toBe(true))
      await fillValidForm()
      await userEvent.click(submitButton())
      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
      // The emptied cart reaches the account before the page goes.
      await waitFor(() => expect(api.carts().has(danaId())).toBe(false))
      cleanup()

      await useAuthStore.getState().login({ email: GOOD.email, password: GOOD.password })
      renderApp('/checkout', catalog)
      await waitFor(() => expect(recoveryNotice()).toHaveTextContent('כבר נקלטה'))
      await fillValidForm()
      await userEvent.click(submitButton())

      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
      expect(sent.keys()[2]).toBe(sent.keys()[0])
      expect(api.orders()).toHaveLength(2)
    })
  })

  describe('and the API is older and cannot say', () => {
    it.each([
      ['a route it does not have (404 not_found)', { status: 404, code: 'not_found' }],
      ['an answer it does not understand', { status: 404, code: 'something_else' }],
      ['an error of its own', { status: 500, code: 'internal_error' }],
    ])('says it could not be verified, with %s, and sends nothing', async (_name, answer) => {
      const sent = await loseTheFirstAnswer()
      cleanup()
      watchLookups(answer)

      renderApp('/checkout', catalog)

      await waitFor(() => expect(recoveryNotice()).toHaveTextContent('לא הצלחנו לבדוק'))
      expect(screen.getByRole('link', { name: '"ההזמנות שלי"' })).toHaveAttribute('href', '/orders')
      expect(screen.queryByRole('button', { name: /הזמנה נפרדת/ })).not.toBeInTheDocument()
      expect(sent.keys()).toHaveLength(1)
      expect(api.orders()).toHaveLength(1)
      expect(localStorage.getItem('online-store:checkout-attempt')).not.toBeNull()
    })

    it('still makes no second order when the details are sent again: the same key goes with them', async () => {
      const sent = await loseTheFirstAnswer()
      cleanup()
      watchLookups({ status: 404, code: 'not_found' })
      renderApp('/checkout', catalog)
      await waitFor(() => expect(recoveryNotice()).toHaveTextContent('לא הצלחנו לבדוק'))

      await fillValidForm()
      await userEvent.click(submitButton())

      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
      expect(sent.keys()[1]).toBe(sent.keys()[0])
      expect(api.orders()).toHaveLength(1)
    })

    it('points to the orders, keeps the key and the cart, and places nothing, when a refused key names no order', async () => {
      answerOrderRequestsWith(409, 'idempotency_key_reuse')
      renderApp('/checkout', catalog)
      await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
      await fillValidForm()

      await userEvent.click(submitButton())

      await waitFor(() => expect(recoveryNotice()).toHaveTextContent('לא הצלחנו לבדוק'))
      expect(screen.getByRole('link', { name: '"ההזמנות שלי"' })).toHaveAttribute('href', '/orders')
      expect(screen.queryByRole('button', { name: /הזמנה נפרדת/ })).not.toBeInTheDocument()
      expect(localStorage.getItem('online-store:checkout-attempt')).not.toBeNull()
      expect(useCartStore.getState().items).toHaveLength(2)
      expect(api.orders()).toHaveLength(0)
      expect(url()).toBe('/checkout')
    })
  })
})

describe('one order at a time', () => {
  beforeEach(async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
  })

  it('sends one request when the button is clicked twice', async () => {
    const sent = watchOrderRequests()
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await fillValidForm()

    await userEvent.dblClick(submitButton())
    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })

    expect(sent.keys()).toHaveLength(1)
    expect(api.orders()).toHaveLength(1)
  })

  it('sends one request when Enter is pressed twice', async () => {
    const sent = watchOrderRequests()
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await fillValidForm()
    await userEvent.click(box('מספר בית'))

    await userEvent.keyboard('{Enter}{Enter}')
    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })

    expect(sent.keys()).toHaveLength(1)
    expect(api.orders()).toHaveLength(1)
  })

  it('empties the cart and forgets the key, without moving the visitor, when the page was left while the order was on its way', async () => {
    const held = holdOrderRequests()
    try {
      renderApp('/checkout', catalog)
      await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
      await fillValidForm()
      await userEvent.click(submitButton())
      await waitFor(() => expect(held.count()).toBe(1))

      await userEvent.click(screen.getByRole('link', { name: 'עגלת קניות' }))
      await screen.findByRole('heading', { level: 1, name: 'עגלת קניות' })
    } finally {
      // Whatever happened above, the held request is let go: a request that never ends would
      // otherwise be joined by the next test's order.
      held.release()
    }

    await waitFor(() => expect(api.orders()).toHaveLength(1))
    await waitFor(() => expect(useCartStore.getState().items).toEqual([]))
    expect(url()).toBe('/cart')
    expect(localStorage.getItem('online-store:checkout-attempt')).toBeNull()
  })

  describe('when the visitor switches accounts while the order is on its way', () => {
    const DANA = { name: 'דנה', email: 'dana@example.com', password: 'Passw0rdOK' }

    it('leaves the cart, the page and the session of the new account alone when the first order comes back', async () => {
      const held = holdOrderRequests()
      try {
        renderApp('/checkout', catalog)
        await screen.findByRole('textbox', { name: 'טלפון' })
        await fillValidForm()
        await userEvent.click(submitButton())
        await waitFor(() => expect(held.count()).toBe(1))

        // Another account takes the browser over; the first account's request is still on its way.
        await useAuthStore.getState().register(DANA)
        act(() => useCartStore.getState().addItem('GPU-1'))
        await waitFor(() =>
          expect(useCartStore.getState().items).toEqual([{ productId: 'GPU-1', quantity: 1 }]),
        )
      } finally {
        held.release()
      }

      // The first account's order is made, as the server does not know about the switch...
      await waitFor(() => expect(api.orders()).toHaveLength(1))
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
      // ...but its answer is not the new account's: nothing of theirs is emptied, moved or signed out.
      expect(useCartStore.getState().items).toEqual([{ productId: 'GPU-1', quantity: 1 }])
      expect(url()).toBe('/checkout')
      expect(useAuthStore.getState().user?.email).toBe(DANA.email)
      expect(useAuthStore.getState().status).toBe('authenticated')
      // The new account has no order and no unresolved attempt of the first one's.
      expect(api.orders()[0]!.userId).not.toBe(useAuthStore.getState().user?.id)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('does not sign the new account out when the first account session has ended by then', async () => {
      const held = holdOrderRequests()
      try {
        renderApp('/checkout', catalog)
        await screen.findByRole('textbox', { name: 'טלפון' })
        await fillValidForm()
        await userEvent.click(submitButton())
        await waitFor(() => expect(held.count()).toBe(1))

        // The first account signs out (which ends its session on the server) and another signs in.
        useAuthStore.getState().logout()
        await useAuthStore.getState().register(DANA)
        act(() => useCartStore.getState().addItem('GPU-1'))
      } finally {
        // The request now carries a session the server has ended: it is answered 401.
        held.release()
      }

      await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
      expect(api.orders()).toHaveLength(0)
      expect(useAuthStore.getState().user?.email).toBe(DANA.email)
      expect(useAuthStore.getState().status).toBe('authenticated')
      expect(useCartStore.getState().items).toEqual([{ productId: 'GPU-1', quantity: 1 }])
    })

    /**
     * The first account sends its order, another account takes the browser over, and the first
     * account's request is answered afterwards (`held.release()`): either the order comes back, or
     * the answer is lost. Either way the new account is left alone (nothing of theirs changes).
     */
    async function sendThenSwitchThenAnswer(held: ReturnType<typeof holdOrderRequests>) {
      try {
        renderApp('/checkout', catalog)
        await screen.findByRole('textbox', { name: 'טלפון' })
        await fillValidForm()
        await userEvent.click(submitButton())
        await waitFor(() => expect(held.count()).toBe(1))

        await useAuthStore.getState().register(DANA)
        act(() => useCartStore.getState().addItem('GPU-1'))
        await waitFor(() =>
          expect(useCartStore.getState().items).toEqual([{ productId: 'GPU-1', quantity: 1 }]),
        )
      } finally {
        held.release()
      }
      await waitFor(() => expect(api.orders()).toHaveLength(1))
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
      expect(useCartStore.getState().items).toEqual([{ productId: 'GPU-1', quantity: 1 }])
      expect(useAuthStore.getState().user?.email).toBe(DANA.email)
      expect(url()).toBe('/checkout')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    }

    /** The first account signs in again: its cart comes back from its account, with what it ordered. */
    async function firstAccountComesBack() {
      cleanup()
      await useAuthStore.getState().login({ email: GOOD.email, password: GOOD.password })
      renderApp('/checkout', catalog)
    }

    it('finds the first account order when it comes back, instead of letting it order again, when the order came back late', async () => {
      const sent = watchOrderRequests()
      await sendThenSwitchThenAnswer(holdOrderRequests())
      const lookups = watchLookups()

      await firstAccountComesBack()

      // Its cart still holds what it ordered, but its attempt was not forgotten: the order is found.
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('כבר נקלטה'))
      expect(screen.getByRole('alert')).toHaveTextContent(api.orders()[0]!.orderNumber)
      expect(lookups.requests()[0]!.body).toEqual({ idempotencyKey: sent.keys()[0] })
      expect(api.orders()).toHaveLength(1)
    })

    it('finds the first account order when it comes back, when the answer to its order was lost', async () => {
      const sent = watchOrderRequests()
      await sendThenSwitchThenAnswer(holdOrderRequests({ loseAnswer: true }))
      const lookups = watchLookups()

      await firstAccountComesBack()

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('כבר נקלטה'))
      expect(screen.getByRole('alert')).toHaveTextContent(api.orders()[0]!.orderNumber)
      expect(lookups.requests()[0]!.body).toEqual({ idempotencyKey: sent.keys()[0] })
      expect(api.orders()).toHaveLength(1)
    })

    it('does not let the first account order the same cart again with a key of its own', async () => {
      const sent = watchOrderRequests()
      await sendThenSwitchThenAnswer(holdOrderRequests())
      await firstAccountComesBack()
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('כבר נקלטה'))

      // Sending the same details again gets the order that exists, not a second one.
      await fillValidForm()
      await userEvent.click(submitButton())

      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
      expect(api.orders()).toHaveLength(1)
      expect(sent.keys()[1]).toBe(sent.keys()[0])
    })
  })

  it('opens a stale checkout page after the order without placing anything', async () => {
    const sent = watchOrderRequests()
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await fillValidForm()
    await userEvent.click(submitButton())
    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
    cleanup()

    renderApp('/checkout', catalog)

    expect(await screen.findByText('העגלה ריקה')).toBeInTheDocument()
    expect(sent.keys()).toHaveLength(1)
    expect(api.orders()).toHaveLength(1)
  })

  it('treats a later order, once the first was confirmed, as a new order with a key of its own', async () => {
    const sent = watchOrderRequests()
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await fillValidForm()
    await userEvent.click(submitButton())
    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
    // The emptied cart reaches the account before the page goes, as it does when a visit goes on.
    await waitFor(() => expect(savedCartLines()).toBe(0))
    cleanup()
    const lookups = watchLookups()

    renderApp('/checkout', catalog)
    expect(await screen.findByText('העגלה ריקה')).toBeInTheDocument()
    act(() => useCartStore.getState().addItem('GPU-1'))
    await screen.findByRole('textbox', { name: 'טלפון' })
    await fillValidForm()
    await userEvent.click(submitButton())

    await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })
    expect(api.orders()).toHaveLength(2)
    expect(sent.keys()[1]).not.toBe(sent.keys()[0])
    // Nothing was unresolved, so nothing was asked and no notice was shown.
    expect(lookups.count()).toBe(0)
  })
})

describe('checkout form layout', () => {
  it('groups the fields into two named sections and says which ones are required', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    expect(screen.getByRole('group', { name: 'פרטי קשר' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'כתובת למשלוח' })).toBeInTheDocument()
    expect(screen.getByText('שדות חובה מסומנים בכוכבית (*).')).toBeInTheDocument()
  })

  it('shows the email, the phone number and the postal code left to right, as they are read', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    for (const name of ['אימייל', 'טלפון', 'מיקוד (לא חובה)']) {
      expect(box(name), name).toHaveAttribute('dir', 'ltr')
    }
    // A name or an address is Hebrew as often as not, and follows the page.
    for (const name of ['שם מלא', 'עיר', 'רחוב', 'דירה (לא חובה)']) {
      expect(box(name), name).not.toHaveAttribute('dir')
    }
  })

  it('repeats the total just above the submit button, for a phone where the summary is far away', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    useCartStore.getState().addItem('GPU-1', 2)
    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    const note = screen.getByText('סה"כ להזמנה').closest('p')!
    expect(note).toHaveTextContent(/2,500/)
    // It sits right before the submit button in the form.
    expect(note.nextElementSibling).toBe(
      screen.getByRole('button', { name: 'אישור הזמנה (הדגמה)' }),
    )
  })

  it('does not change the order summary, which still has exactly one total', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    expect(within(summary()).getAllByText('סה"כ')).toHaveLength(1)
  })
})

describe('the rules for the delivery details', () => {
  beforeEach(async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
  })

  async function openCheckout() {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await screen.findByRole('textbox', { name: 'טלפון' }) // the form, once the cart is known
  }

  async function fillAddress({ city = 'תל אביב', street = 'דיזנגוף', houseNumber = '12' } = {}) {
    await userEvent.type(box('עיר'), city)
    await userEvent.type(box('רחוב'), street)
    await userEvent.type(box('מספר בית'), houseNumber)
    await userEvent.click(screen.getByRole('checkbox', { name: /הזמנת הדגמה/ }))
  }

  it('reads a number pasted from a right-to-left page and sends it written locally', async () => {
    const sent = watchOrderRequests()
    await openCheckout()

    await userEvent.click(box('טלפון'))
    await userEvent.paste('\u200f+972 50-123-4567\u200e')
    await fillAddress()
    await userEvent.click(submitButton())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' }),
    ).toBeInTheDocument()
    expect(sent.bodies()).toHaveLength(1)
    expect(sent.bodies()[0]).toMatchObject({ delivery: { phone: '0501234567' } })
    expect(api.orders()[0]?.delivery.phone).toBe('0501234567')
  })

  it('reads an address pasted with a direction mark and stores it without', async () => {
    const sent = watchOrderRequests()
    await openCheckout()

    await userEvent.clear(box('אימייל'))
    await userEvent.click(box('אימייל'))
    await userEvent.paste('\u200fnetanel@example.com\u200e')
    await userEvent.type(box('טלפון'), '0501234567')
    await fillAddress({ city: 'פ"ת', street: "ז'בוטינסקי" })
    await userEvent.type(box('מיקוד (לא חובה)'), '49-100-00')
    await userEvent.click(submitButton())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' }),
    ).toBeInTheDocument()
    expect(sent.bodies()[0]).toMatchObject({
      delivery: {
        email: 'netanel@example.com',
        city: 'פ"ת',
        street: "ז'בוטינסקי",
        postalCode: '4910000',
      },
    })
  })

  it('says what is not allowed, keeps what was typed, and places no order', async () => {
    const sent = watchOrderRequests()
    await openCheckout()

    await userEvent.type(box('טלפון'), '0000000000')
    await fillAddress({ city: '=cmd|calc', street: '<b>הרצל</b>', houseNumber: '0' })
    await userEvent.type(box('הערות למשלוח (לא חובה)'), '=SUM(1,2)')
    await userEvent.click(submitButton())

    expect(await screen.findByText('מספר הטלפון אינו תקין')).toBeInTheDocument()
    expect(screen.getByText('עיר מכיל תווים שאינם מותרים')).toBeInTheDocument()
    expect(screen.getByText('רחוב מכיל תווים שאינם מותרים')).toBeInTheDocument()
    expect(screen.getByText('מספר הבית אינו תקין')).toBeInTheDocument()
    expect(screen.getByText('ההערות לא יכולות להתחיל בסימן מיוחד')).toBeInTheDocument()
    expect(box('עיר')).toHaveValue('=cmd|calc')
    expect(sent.bodies()).toEqual([])
    expect(api.orders()).toHaveLength(0)
    expect(url()).toBe('/checkout')
  })

  it('places the order once the details are corrected', async () => {
    await openCheckout()
    await userEvent.type(box('טלפון'), '0501234567')
    await fillAddress({ city: '=cmd', street: 'דיזנגוף' })
    await userEvent.click(submitButton())
    expect(await screen.findByText('עיר מכיל תווים שאינם מותרים')).toBeInTheDocument()

    await userEvent.clear(box('עיר'))
    await userEvent.type(box('עיר'), 'תל אביב')
    await userEvent.click(submitButton())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' }),
    ).toBeInTheDocument()
    expect(api.orders()).toHaveLength(1)
  })

  it('accepts an address that has no house number, and one with several lines of notes', async () => {
    const sent = watchOrderRequests()
    await openCheckout()

    await userEvent.type(box('טלפון'), '04-8651234')
    await fillAddress({ city: 'קיבוץ מעגן מיכאל', street: 'השקד', houseNumber: 'ללא מספר' })
    await userEvent.type(box('הערות למשלוח (לא חובה)'), 'שורה ראשונה{Enter}שורה שנייה')
    await userEvent.click(submitButton())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' }),
    ).toBeInTheDocument()
    expect(sent.bodies()[0]).toMatchObject({
      delivery: { phone: '048651234', houseNumber: 'ללא מספר', notes: 'שורה ראשונה\nשורה שנייה' },
    })
  })

  it('refuses a tab among the digits of a phone number or a postal code, and sends nothing', async () => {
    const sent = watchOrderRequests()
    await openCheckout()

    await userEvent.click(box('טלפון'))
    await userEvent.paste('050\t1234567')
    await fillAddress()
    await userEvent.click(box('מיקוד (לא חובה)'))
    await userEvent.paste('64369\t01')
    await userEvent.click(submitButton())

    expect(await screen.findByText('מספר הטלפון אינו תקין')).toBeInTheDocument()
    expect(screen.getByText('המיקוד חייב להכיל 7 ספרות')).toBeInTheDocument()
    expect(sent.bodies()).toEqual([])
    expect(api.orders()).toHaveLength(0)
  })

  it('refuses a tab at the end of a name, which is not a space to be tidied away', async () => {
    const sent = watchOrderRequests()
    await openCheckout()

    await userEvent.type(box('טלפון'), '0501234567')
    await fillAddress({ city: 'תל אביב\t' })
    await userEvent.click(submitButton())

    expect(await screen.findByText('עיר מכיל תווים שאינם מותרים')).toBeInTheDocument()
    expect(sent.bodies()).toEqual([])
  })

  it('does not cut a long note short in the field: it counts characters, as the API does', async () => {
    const sent = watchOrderRequests()
    await openCheckout()
    const notes = box('הערות למשלוח (לא חובה)')

    // 300 simple emoji are 600 units of the browser's own length, and 300 code points for the rules.
    await userEvent.type(box('טלפון'), '0501234567')
    await fillAddress()
    await userEvent.click(notes)
    await userEvent.paste('🙏'.repeat(300))
    expect(notes).toHaveValue('🙏'.repeat(300))
    await userEvent.click(submitButton())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' }),
    ).toBeInTheDocument()
    expect(sent.bodies()[0]).toMatchObject({ delivery: { notes: '🙏'.repeat(300) } })
  })

  it('tells the visitor that a note is too long, and keeps all of it', async () => {
    const sent = watchOrderRequests()
    await openCheckout()
    const notes = box('הערות למשלוח (לא חובה)')

    await userEvent.type(box('טלפון'), '0501234567')
    await fillAddress()
    await userEvent.click(notes)
    await userEvent.paste('א'.repeat(301))
    await userEvent.click(submitButton())

    expect(await screen.findByText('ההערות ארוכות מדי (עד 300 תווים)')).toBeInTheDocument()
    expect(notes).toHaveValue('א'.repeat(301))
    expect(sent.bodies()).toEqual([])
  })

  it('says how long a note may be, in a hint that the field is described by', async () => {
    await openCheckout()
    const notes = box('הערות למשלוח (לא חובה)')

    expect(screen.getByText('עד 300 תווים')).toBeVisible()
    expect(notes).toHaveAccessibleDescription('עד 300 תווים')
    // The hint is not part of the name of the field, and the field has no length limit of its own.
    expect(notes).toHaveAccessibleName('הערות למשלוח (לא חובה)')
    expect(notes).not.toHaveAttribute('maxlength')
  })

  it('keeps the hint when the note is too long, and adds the error to what the field is described by', async () => {
    await openCheckout()
    const notes = box('הערות למשלוח (לא חובה)')

    await userEvent.type(box('טלפון'), '0501234567')
    await fillAddress()
    await userEvent.click(notes)
    await userEvent.paste('א'.repeat(301))
    await userEvent.click(submitButton())

    await screen.findByText('ההערות ארוכות מדי (עד 300 תווים)')
    expect(screen.getByText('עד 300 תווים')).toBeVisible()
    expect(notes).toHaveAttribute('aria-invalid', 'true')
    expect(notes).toHaveAccessibleDescription('עד 300 תווים ההערות ארוכות מדי (עד 300 תווים)')
  })

  it('keeps what is typed or pasted whole, however it counts: a flag, a family, niqqud and Arabic marks', async () => {
    await openCheckout()
    const notes = box('הערות למשלוח (לא חובה)')
    const text =
      '🇮🇱 👨\u200D👩\u200D👧 👍🏽 ❤\uFE0F ש\u05B8\u05C1לו\u05B9ם م\u064Fح\u064Eم\u064E\u0651د 🙏'

    await userEvent.click(notes)
    await userEvent.paste(text.repeat(5))
    expect(notes).toHaveValue(text.repeat(5))
    await userEvent.clear(notes)
    await userEvent.type(notes, 'ש\u05B8\u05C1לו\u05B9ם 🙏 🇮🇱')
    expect(notes).toHaveValue('ש\u05B8\u05C1לו\u05B9ם 🙏 🇮🇱')
  })

  it('does not say that an address exists or can be delivered to', async () => {
    await openCheckout()

    await userEvent.click(submitButton())
    await screen.findByText('יש להזין מספר טלפון')

    const form = screen.getByRole('button', { name: 'אישור הזמנה (הדגמה)' }).closest('form')!
    expect(form).not.toHaveTextContent(/כתובת (קיימת|תקינה למשלוח)|ניתן לשלוח/)
  })
})
