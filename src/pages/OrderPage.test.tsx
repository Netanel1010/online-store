import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { placeOrder } from '@/features/orders/orderService'
import { makeProduct } from '@/test/fixtures'
import { setUpAuthApi } from '@/test/authApi'
import { signOutFromHeader } from '@/test/accountMenu'
import { renderApp } from '@/test/renderApp'

// The real authentication and orders API answers these tests (see setUpAuthApi).
const api = setUpAuthApi()

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }
const DELIVERY = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '050-1234567',
  city: 'חיפה',
  street: 'הנשיא',
  houseNumber: '12',
  apartment: '4',
  postalCode: '3100000',
  notes: 'בבקשה לצלצל פעמיים',
}

const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח', price: { current: 1000 } })
const gpu = makeProduct({
  id: 'GPU-1',
  name: 'כרטיס מסך',
  price: { current: 750, original: 1000 },
})
const catalog = [psu, gpu]

const url = () => screen.getByTestId('url').textContent
const summary = () => screen.getByRole('complementary', { name: 'סיכום הזמנה' })
const total = () => within(summary()).getByText('סה"כ').nextElementSibling

beforeEach(() => api.setCatalog(catalog))

/** Signs in and places an order through the API, as the checkout does. */
async function placedOrder() {
  await useAuthStore.getState().register(GOOD)
  const outcome = await placeOrder({
    token: useAuthStore.getState().token!,
    idempotencyKey: crypto.randomUUID(),
    items: [
      { productId: 'PSU-1', quantity: 1 },
      { productId: 'GPU-1', quantity: 2 },
    ],
    delivery: DELIVERY,
    expectedTotal: 2500,
  })
  if (!outcome.ok) throw new Error('the order was not placed')
  return outcome.order
}

describe('the page of an order', () => {
  it('loads the order from the API by its number, with no router state', async () => {
    const order = await placedOrder()

    renderApp(`/orders/${order.orderNumber}`, catalog)

    expect(await screen.findByRole('heading', { level: 1, name: 'פרטי הזמנה' })).toBeInTheDocument()
    expect(screen.getByText(order.orderNumber)).toBeInTheDocument()
    const lines = screen.getByRole('list', { name: 'המוצרים שהוזמנו' })
    expect(within(lines).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lines).getByText('כרטיס מסך')).toBeInTheDocument()
    expect(within(lines).getByText(/כמות: 2/)).toBeInTheDocument()
    expect(total()).toHaveTextContent(/2,500/)
    expect(within(summary()).getByText('חיסכון').nextElementSibling).toHaveTextContent(/500/)
    expect(within(summary()).getByText('מספר פריטים').nextElementSibling).toHaveTextContent('3')
  })

  it('shows the delivery details that were saved with the order', async () => {
    const order = await placedOrder()

    renderApp(`/orders/${order.orderNumber}`, catalog)

    const details = await screen.findByRole('region', { name: 'פרטי משלוח' })
    expect(details).toHaveTextContent('נתנאל כהן')
    expect(details).toHaveTextContent('netanel@example.com')
    expect(details).toHaveTextContent('050-1234567')
    expect(details).toHaveTextContent('הנשיא 12, דירה 4, חיפה, 3100000')
    expect(details).toHaveTextContent('בבקשה לצלצל פעמיים')
  })

  it('opens the same after a reload, because nothing depends on the router state', async () => {
    const order = await placedOrder()
    const first = renderApp(`/orders/${order.orderNumber}`, catalog)
    await screen.findByRole('heading', { level: 1, name: 'פרטי הזמנה' })
    first.unmount()

    // A reload keeps the session token (localStorage) and nothing else of the page.
    renderApp(`/orders/${order.orderNumber}`, catalog)

    expect(await screen.findByRole('heading', { level: 1, name: 'פרטי הזמנה' })).toBeInTheDocument()
    expect(screen.getByText(order.orderNumber)).toBeInTheDocument()
    expect(total()).toHaveTextContent(/2,500/)
  })

  it('shows what the order says, not what the catalog says now', async () => {
    const order = await placedOrder()
    const renamed = makeProduct({ id: 'GPU-1', name: 'שם חדש', price: { current: 9999 } })

    renderApp(`/orders/${order.orderNumber}`, [psu, renamed])

    const lines = await screen.findByRole('list', { name: 'המוצרים שהוזמנו' })
    expect(within(lines).getByText('כרטיס מסך')).toBeInTheDocument()
    expect(within(lines).queryByText('שם חדש')).not.toBeInTheDocument()
    expect(lines).not.toHaveTextContent('9,999')
    expect(total()).toHaveTextContent(/2,500/)
  })

  it('still opens when its products are no longer in the catalog, and when the catalog is down', async () => {
    const order = await placedOrder()

    renderApp(`/orders/${order.orderNumber}`, new Error('catalog down'))

    const lines = await screen.findByRole('list', { name: 'המוצרים שהוזמנו' })
    expect(within(lines).getByText('ספק כוח')).toBeInTheDocument()
    expect(within(lines).getByText('כרטיס מסך')).toBeInTheDocument()
    expect(total()).toHaveTextContent(/2,500/)
  })

  it('links each line to its product, and shows a picture when the catalog has one', async () => {
    const order = await placedOrder()

    renderApp(`/orders/${order.orderNumber}`, catalog)

    const lines = await screen.findByRole('list', { name: 'המוצרים שהוזמנו' })
    expect(within(lines).getByRole('link', { name: 'ספק כוח' })).toHaveAttribute(
      'href',
      '/products/PSU-1',
    )
    await waitFor(() => expect(lines.querySelectorAll('img')).toHaveLength(2))
  })

  it('welcomes a visitor who has just ordered, and says what was and was not done', async () => {
    const order = await placedOrder()

    renderApp(`/orders/${order.orderNumber}`, catalog)
    const note = await screen.findByRole('complementary', { name: 'הערה' })

    expect(note).toHaveTextContent('לא בוצע חיוב')
    expect(note).toHaveTextContent('נשמרו בחשבון שלכם')
    expect(note).not.toHaveTextContent('אינה נשמרת')
    expect(summary()).toHaveTextContent('לא מחושבים משלוח ומע"מ')
  })

  it('offers the next steps', async () => {
    const order = await placedOrder()

    renderApp(`/orders/${order.orderNumber}`, catalog)

    expect(await screen.findByRole('link', { name: 'המשך קנייה' })).toHaveAttribute(
      'href',
      '/products',
    )
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')
  })

  it('does not keep the order or the delivery details in the browser', async () => {
    const order = await placedOrder()

    renderApp(`/orders/${order.orderNumber}`, catalog)
    await screen.findByRole('heading', { level: 1, name: 'פרטי הזמנה' })

    const everything = JSON.stringify({ ...localStorage })
    expect(everything).not.toContain('הנשיא')
    expect(everything).not.toContain('050-1234567')
    expect(everything).not.toContain(order.orderNumber)
  })

  it('signs out to the home page when the visitor signs out on it', async () => {
    const order = await placedOrder()
    renderApp(`/orders/${order.orderNumber}`, catalog)
    await screen.findByRole('heading', { level: 1, name: 'פרטי הזמנה' })

    await signOutFromHeader()

    await waitFor(() => expect(url()).toBe('/'))
  })
})

describe('an order that cannot be shown', () => {
  it('says "not found" for an order number nobody has', async () => {
    await useAuthStore.getState().register(GOOD)

    renderApp('/orders/DEMO-ZZZZZZZZ', catalog)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ההזמנה לא נמצאה' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toBeInTheDocument()
  })

  it('says the same for something that cannot be an order number', async () => {
    await useAuthStore.getState().register(GOOD)

    renderApp('/orders/not-an-order', catalog)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ההזמנה לא נמצאה' }),
    ).toBeInTheDocument()
  })

  it('says the same for the order of another account, and shows nothing of it', async () => {
    const order = await placedOrder()
    useAuthStore.getState().logout()
    await waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'))
    await useAuthStore.getState().register({ ...GOOD, name: 'דנה', email: 'dana@example.com' })

    renderApp(`/orders/${order.orderNumber}`, catalog)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ההזמנה לא נמצאה' }),
    ).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('050-1234567')
    expect(document.body).not.toHaveTextContent('הנשיא')
  })

  it('says it could not be loaded, and loads it on a retry', async () => {
    const order = await placedOrder()
    const real = globalThis.fetch
    let calls = 0
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/orders/') && (calls += 1) === 1) {
        return Promise.reject(new TypeError('network down'))
      }
      return real(input, init)
    })

    renderApp(`/orders/${order.orderNumber}`, catalog)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('לא הצלחנו לטעון את ההזמנה')
    expect(alert).toHaveTextContent('ההזמנה לא נפגעה')
    await userEvent.click(within(alert).getByRole('button', { name: 'נסו שוב' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'פרטי הזמנה' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a loading status while the order is being fetched', async () => {
    const order = await placedOrder()
    const real = globalThis.fetch
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/orders/')) await gate
      return real(input, init)
    })

    renderApp(`/orders/${order.orderNumber}`, catalog)

    expect(await screen.findByText('טוען את פרטי ההזמנה…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'פרטי הזמנה' })).not.toBeInTheDocument()
    release()
    expect(await screen.findByRole('heading', { level: 1, name: 'פרטי הזמנה' })).toBeInTheDocument()
  })

  it('signs the visitor out, and sends them to log in, when the API no longer knows the session', async () => {
    const order = await placedOrder()
    api.endAllSessions()

    renderApp(`/orders/${order.orderNumber}`, catalog)

    await waitFor(() => expect(url()).toBe('/login'))
    expect(useAuthStore.getState().status).toBe('anonymous')
    expect(document.body).not.toHaveTextContent('050-1234567')
  })

  it('sends a signed-out visitor to the login page and brings them back to the order', async () => {
    renderApp('/orders/DEMO-ABCDEFGH', catalog)

    await waitFor(() => expect(url()).toBe('/login'))
    expect(screen.queryByRole('heading', { name: 'ההזמנה לא נמצאה' })).not.toBeInTheDocument()
  })
})
