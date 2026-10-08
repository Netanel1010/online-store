import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { useCartStore } from '@/features/cart/cartStore'
import { placeOrder } from '@/features/orders/orderService'
import { setUpAuthApi } from '@/test/authApi'
import { openAccountMenu, signOutFromHeader } from '@/test/accountMenu'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

// The real authentication and orders API answers these tests (see setUpAuthApi).
const api = setUpAuthApi()

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }
const OTHER = { name: 'דנה', email: 'dana@example.com', password: 'Passw0rdOK' }

const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח', price: { current: 1000 } })
const catalog = [psu]

const url = () => screen.getByTestId('url').textContent
const list = () => screen.getByRole('list', { name: 'ההזמנות שלי' })
const cards = () => within(list()).getAllByRole('listitem')

beforeEach(() => api.setCatalog(catalog))

/** Places an order of `quantity` power supplies for the signed-in account, as the checkout does. */
async function placeAnOrder(quantity: number, city = 'חיפה') {
  const outcome = await placeOrder({
    token: useAuthStore.getState().token!,
    idempotencyKey: crypto.randomUUID(),
    items: [{ productId: 'PSU-1', quantity }],
    delivery: {
      fullName: 'נתנאל כהן',
      email: GOOD.email,
      phone: '050-1234567',
      city,
      street: 'הנשיא',
      houseNumber: '12',
      apartment: '',
      postalCode: '',
      notes: '',
    },
    expectedTotal: 1000 * quantity,
  })
  if (!outcome.ok) throw new Error('the order was not placed')
  return outcome.order
}

describe('the orders of the account', () => {
  it('lists them from the API, the newest first, with what each one says about itself', async () => {
    await useAuthStore.getState().register(GOOD)
    const first = await placeAnOrder(1, 'חיפה')
    const second = await placeAnOrder(2, 'תל אביב')
    const third = await placeAnOrder(3, 'באר שבע')

    renderApp('/orders', catalog)

    await screen.findByRole('list', { name: 'ההזמנות שלי' })
    expect(screen.getByRole('heading', { level: 1, name: 'ההזמנות שלי' })).toBeInTheDocument()
    const items = cards()
    expect(items).toHaveLength(3)
    expect(items.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      third.orderNumber,
      second.orderNumber,
      first.orderNumber,
    ])

    const newest = items[0]!
    expect(within(newest).getByText(/3,000/)).toBeInTheDocument()
    expect(within(newest).getByText('3 פריטים')).toBeInTheDocument()
    expect(within(newest).getByText('התקבלה')).toBeInTheDocument()
    expect(within(newest).getByText(/משלוח אל באר שבע/)).toBeInTheDocument()
    expect(within(newest).getByText(/נתנאל כהן/)).toBeInTheDocument()
    // The date: the order number is random and can contain four digits too, so ask the time element.
    const date = newest.querySelector('time')
    expect(date).toHaveAttribute('datetime', third.createdAt)
    expect(date).toHaveTextContent(/\d{4}/)
    expect(within(items[2]!).getByText('פריט אחד')).toBeInTheDocument()
    expect(screen.getByText('3 הזמנות, מהחדשה לישנה.')).toBeInTheDocument()
  })

  it('links every order to its own page', async () => {
    await useAuthStore.getState().register(GOOD)
    const order = await placeAnOrder(2)
    renderApp('/orders', catalog)

    await screen.findByRole('list', { name: 'ההזמנות שלי' })
    const card = cards()[0]!
    for (const link of within(card).getAllByRole('link')) {
      expect(link).toHaveAttribute('href', `/orders/${order.orderNumber}`)
    }
    await userEvent.click(within(card).getByRole('link', { name: /לפרטי ההזמנה/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'פרטי הזמנה' })).toBeInTheDocument()
    expect(url()).toBe(`/orders/${order.orderNumber}`)
    // The page of an order leads back to the list (the menu has the same link, so look in the page).
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'ההזמנות שלי' }),
    ).toHaveAttribute('href', '/orders')
  })

  it('shows what the orders say, not what the catalog says now', async () => {
    await useAuthStore.getState().register(GOOD)
    await placeAnOrder(2)

    renderApp('/orders', [makeProduct({ id: 'PSU-1', name: 'שם חדש', price: { current: 9999 } })])

    expect(await screen.findByText(/2,000/)).toBeInTheDocument()
    expect(list()).not.toHaveTextContent('9,999')
  })

  it('shows only the orders of the signed-in account', async () => {
    await useAuthStore.getState().register(GOOD)
    const mine = await placeAnOrder(1)
    useAuthStore.getState().logout()
    await waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'))
    await useAuthStore.getState().register(OTHER)
    const theirs = await placeAnOrder(4)

    renderApp('/orders', catalog)

    expect(await screen.findByRole('heading', { name: theirs.orderNumber })).toBeInTheDocument()
    expect(cards()).toHaveLength(1)
    expect(document.body).not.toHaveTextContent(mine.orderNumber)
  })

  it('does not keep the orders or their details in the browser', async () => {
    await useAuthStore.getState().register(GOOD)
    const order = await placeAnOrder(1)
    renderApp('/orders', catalog)
    await screen.findByRole('heading', { name: order.orderNumber })

    const everything = JSON.stringify({ ...localStorage })
    expect(everything).not.toContain(order.orderNumber)
    expect(everything).not.toContain('הנשיא')
    expect(everything).not.toContain('050-1234567')
  })

  it('leaves the cart as it is', async () => {
    await useAuthStore.getState().register(GOOD)
    await placeAnOrder(1)
    useCartStore.getState().addItem('PSU-1', 2)
    renderApp('/orders', catalog)
    await screen.findByRole('list', { name: 'ההזמנות שלי' })

    expect(useCartStore.getState().items).toEqual([{ productId: 'PSU-1', quantity: 2 }])
  })
})

describe('the states of the page', () => {
  it('says there are no orders yet, and points to the products', async () => {
    await useAuthStore.getState().register(GOOD)

    renderApp('/orders', catalog)

    expect(await screen.findByRole('heading', { name: 'עדיין אין לכם הזמנות' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')
    expect(screen.queryByRole('list', { name: 'ההזמנות שלי' })).not.toBeInTheDocument()
  })

  it('shows a loading status while the orders are fetched', async () => {
    await useAuthStore.getState().register(GOOD)
    await placeAnOrder(1)
    const real = globalThis.fetch
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/orders')) await gate
      return real(input, init)
    })

    renderApp('/orders', catalog)

    expect(await screen.findByText('טוען את ההזמנות…')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'ההזמנות שלי' })).not.toBeInTheDocument()
    release()
    expect(await screen.findByRole('list', { name: 'ההזמנות שלי' })).toBeInTheDocument()
  })

  it('says it could not load the orders, and loads them on a retry', async () => {
    await useAuthStore.getState().register(GOOD)
    await placeAnOrder(1)
    const real = globalThis.fetch
    let calls = 0
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/orders') && (calls += 1) === 1) {
        return Promise.reject(new TypeError('network down'))
      }
      return real(input, init)
    })

    renderApp('/orders', catalog)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('לא הצלחנו לטעון את ההזמנות')
    expect(alert).toHaveTextContent('לא נפגעו')
    await userEvent.click(within(alert).getByRole('button', { name: 'נסו שוב' }))
    expect(await screen.findByRole('list', { name: 'ההזמנות שלי' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('treats an answer it does not understand as an error, not as an empty list', async () => {
    await useAuthStore.getState().register(GOOD)
    const real = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/api/orders')
        ? Promise.resolve(Response.json({ items: 'nothing' }))
        : real(input, init),
    )

    renderApp('/orders', catalog)

    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו לטעון את ההזמנות')
    expect(screen.queryByRole('heading', { name: 'עדיין אין לכם הזמנות' })).not.toBeInTheDocument()
  })

  it('signs the visitor out, and sends them to log in, when the API no longer knows the session', async () => {
    await useAuthStore.getState().register(GOOD)
    api.endAllSessions()

    renderApp('/orders', catalog)

    await waitFor(() => expect(url()).toBe('/login'))
    expect(useAuthStore.getState().status).toBe('anonymous')
  })

  it('is for signed-in visitors only', async () => {
    renderApp('/orders', catalog)

    await waitFor(() => expect(url()).toBe('/login'))
    expect(screen.queryByRole('heading', { name: 'ההזמנות שלי' })).not.toBeInTheDocument()
  })

  it('goes to the home page when the visitor signs out on it', async () => {
    await useAuthStore.getState().register(GOOD)
    renderApp('/orders', catalog)
    await screen.findByRole('heading', { level: 1, name: 'ההזמנות שלי' })

    await signOutFromHeader()

    await waitFor(() => expect(url()).toBe('/'))
  })
})

describe('an account with many orders', () => {
  async function manyOrders(count: number) {
    await useAuthStore.getState().register(GOOD)
    for (let quantity = 1; quantity <= count; quantity += 1) await placeAnOrder(quantity)
  }

  it('shows a page at a time, and adds the next page below on request', async () => {
    await manyOrders(21)

    renderApp('/orders', catalog)

    await screen.findByRole('list', { name: 'ההזמנות שלי' })
    expect(cards()).toHaveLength(20)
    expect(screen.getByText('21 הזמנות, מהחדשה לישנה.')).toBeInTheDocument()
    expect(within(cards()[0]!).getByText(/21,000/)).toBeInTheDocument() // the newest
    await userEvent.click(screen.getByRole('button', { name: 'הצגת הזמנות נוספות' }))

    await waitFor(() => expect(cards()).toHaveLength(21))
    expect(within(cards()[20]!).getByText(/1,000/)).toBeInTheDocument() // the oldest, last
    expect(screen.queryByRole('button', { name: 'הצגת הזמנות נוספות' })).not.toBeInTheDocument()
    expect(new Set(cards().map((card) => within(card).getByRole('heading').textContent)).size).toBe(
      21,
    )
  })

  it('has no button when everything fits on one page', async () => {
    await manyOrders(2)

    renderApp('/orders', catalog)

    await screen.findByRole('list', { name: 'ההזמנות שלי' })
    expect(screen.queryByRole('button', { name: 'הצגת הזמנות נוספות' })).not.toBeInTheDocument()
  })

  it('keeps the orders shown, and says so, when the next page cannot be loaded', async () => {
    await manyOrders(21)
    const real = globalThis.fetch
    let failing = true
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      failing && String(input).includes('/api/orders?page=2')
        ? Promise.reject(new TypeError('network down'))
        : real(input, init),
    )
    renderApp('/orders', catalog)
    await screen.findByRole('list', { name: 'ההזמנות שלי' })

    await userEvent.click(screen.getByRole('button', { name: 'הצגת הזמנות נוספות' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו לטעון עוד הזמנות')
    expect(cards()).toHaveLength(20)
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'הצגת הזמנות נוספות' }))
    await waitFor(() => expect(cards()).toHaveLength(21))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not list an order twice when a new one was placed while reading', async () => {
    await manyOrders(21)
    renderApp('/orders', catalog)
    await screen.findByRole('list', { name: 'ההזמנות שלי' })

    await placeAnOrder(30) // pushes the 20th order of page 1 onto page 2
    await userEvent.click(screen.getByRole('button', { name: 'הצגת הזמנות נוספות' }))

    await waitFor(() => expect(cards().length).toBeGreaterThan(20))
    const numbers = cards().map((card) => within(card).getByRole('heading').textContent)
    expect(new Set(numbers).size).toBe(numbers.length)
    expect(cards()).toHaveLength(21)
  })
})

describe('the account menu', () => {
  it('offers the orders to a signed-in visitor, in the header and in the menu', async () => {
    await useAuthStore.getState().register(GOOD)
    renderApp('/', catalog)

    const links = await screen.findAllByRole('link', { name: 'ההזמנות שלי', hidden: true })

    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', '/orders')
  })

  it('does not offer them to a signed-out visitor', async () => {
    renderApp('/', catalog)
    await screen.findByRole('heading', { level: 1 })

    expect(
      screen.queryByRole('link', { name: 'ההזמנות שלי', hidden: true }),
    ).not.toBeInTheDocument()
  })

  it('opens the page of the orders', async () => {
    await useAuthStore.getState().register(GOOD)
    renderApp('/', catalog)

    await userEvent.click((await openAccountMenu()).getByRole('link', { name: 'ההזמנות שלי' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ההזמנות שלי' }),
    ).toBeInTheDocument()
    expect(url()).toBe('/orders')
  })

  it('marks the link as the current page while the orders are open', async () => {
    await useAuthStore.getState().register(GOOD)
    renderApp('/orders', catalog)
    await screen.findByRole('heading', { level: 1, name: 'ההזמנות שלי' })

    const links = screen.getAllByRole('link', { name: 'ההזמנות שלי', hidden: true })

    for (const link of links) expect(link).toHaveAttribute('aria-current', 'page')
  })
})
