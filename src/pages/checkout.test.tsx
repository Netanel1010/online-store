import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { setServerLine } from '@/features/cart/cartService'
import { useCartStore } from '@/features/cart/cartStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { makeProduct } from '@/test/fixtures'
import { setUpAuthApi } from '@/test/authApi'
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
function answerOrderRequestsWith(status: number) {
  const inner = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    isOrderRequest(input, init)
      ? Promise.resolve(Response.json({ error: { code: 'x', message: 'x' } }, { status }))
      : inner(input, init),
  )
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

    await userEvent.click(screen.getAllByRole('button', { name: 'התנתקות' })[0]!)

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

    const { fetchProducts } = renderApp('/checkout', catalog)
    await waitFor(() => expect(fetchProducts).toHaveBeenCalled())
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

  it('says that this is a demo and that nothing is charged', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)

    expect(await screen.findByRole('complementary', { name: 'הערה' })).toHaveTextContent(
      'לא מתבצע חיוב',
    )
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
      await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' }),
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
    await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })

    expect(sent.bodies()).toEqual([
      {
        items: [
          { productId: 'PSU-1', quantity: 1 },
          { productId: 'GPU-1', quantity: 2 },
        ],
        delivery: {
          fullName: GOOD.name,
          email: GOOD.email,
          phone: '050-1234567',
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
    await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })

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
    await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })

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

    await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })
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

    await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })
    expect(sent.keys()[1]).toBe(sent.keys()[0])
    expect(api.orders()).toHaveLength(1)
    expect(url()).toBe(`/orders/${api.orders()[0]!.orderNumber}`)
    expect(useCartStore.getState().items).toEqual([])
  })

  it('uses a key of its own for an order that is not the same', async () => {
    const sent = watchOrderRequests('fail-first')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })
    await fillValidForm()
    await userEvent.click(submitButton())
    await screen.findByRole('alert')

    useCartStore.getState().setQuantity('PSU-1', 3) // another order
    await userEvent.click(submitButton())

    await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })
    expect(sent.keys()[1]).not.toBe(sent.keys()[0])
    expect(api.orders()).toHaveLength(1)
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
    await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })
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
    await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })
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
    await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })
    const note = screen.getByRole('complementary', { name: 'הערה' })
    expect(note).toHaveTextContent('לא בוצע חיוב')
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
