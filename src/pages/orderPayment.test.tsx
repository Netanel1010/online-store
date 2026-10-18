import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { placeOrder } from '@/features/orders/orderService'
import { paymentPolling } from '@/features/orders/useOrder'
import { setUpAuthApi } from '@/test/authApi'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

// The simulated payment on the page of an order and in the list, against the real orders API with
// short timings (see setUpAuthApi).
const api = setUpAuthApi()
const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח', price: { current: 1000 } })
const catalog = [psu]
const SHORT = { settleDelayMs: 150, attemptTimeoutMs: 600, expiryMs: 60_000 }
const DELIVERY = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '0501234567',
  city: 'חיפה',
  street: 'הנשיא',
  houseNumber: '12',
  apartment: '',
  postalCode: '',
  notes: '',
}

const defaults = { ...paymentPolling }
beforeEach(async () => {
  api.setCatalog(catalog)
  api.setPaymentTimings(SHORT)
  paymentPolling.intervalMs = 30
  await useAuthStore
    .getState()
    .register({ name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' })
})
afterEach(() => {
  Object.assign(paymentPolling, defaults)
})

async function placed() {
  const outcome = await placeOrder({
    token: useAuthStore.getState().token!,
    idempotencyKey: crypto.randomUUID(),
    items: [{ productId: 'PSU-1', quantity: 1 }],
    delivery: DELIVERY,
    expectedTotal: 1000,
  })
  if (!outcome.ok) throw new Error('the order was not placed')
  return outcome.order
}

const panel = () => screen.getByRole('region', { name: 'תשלום מדומה' })
const SCENARIOS = [
  'תשלום מאושר',
  'תשלום נדחה',
  'הספק לא עונה',
  'ביטול אצל הספק',
  'אישור כפול מהספק',
]

describe('the simulated payment of an order', () => {
  it('says that nothing is charged and no product is sent, and offers the five scenarios', async () => {
    const order = await placed()
    renderApp(`/orders/${order.orderNumber}`, catalog)

    await screen.findByRole('region', { name: 'תשלום מדומה' })
    expect(panel()).toHaveTextContent(
      'תשלום מדומה: לא נגבה כסף, לא נדרשים פרטי כרטיס, ולא יישלח מוצר.',
    )
    expect(within(panel()).getByRole('status')).toHaveTextContent('ממתין לתשלום')
    const choice = within(panel()).getByRole('group', { name: 'בחרו מה יקרה בתשלום המדומה' })
    expect(
      within(choice)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(SCENARIOS)
    expect(within(panel()).queryByRole('textbox')).toBeNull()
  })

  it('goes from processing to paid, then refunds, only as the server answers', async () => {
    const order = await placed()
    renderApp(`/orders/${order.orderNumber}`, catalog)
    await screen.findByRole('region', { name: 'תשלום מדומה' })

    await userEvent.click(within(panel()).getByRole('button', { name: 'תשלום מאושר' }))
    expect(
      await within(panel()).findByRole('button', { name: 'ביטול הניסיון' }),
    ).toBeInTheDocument()
    expect(within(panel()).getByRole('status')).toHaveTextContent('בעיבוד')
    expect(within(panel()).getByRole('list', { name: 'ניסיונות התשלום' })).toHaveTextContent(
      'ניסיון 1: תשלום מאושר · בעיבוד',
    )

    const refund = await within(panel()).findByRole(
      'button',
      { name: 'החזר כספי מדומה' },
      { timeout: 3000 },
    )
    expect(within(panel()).getByRole('status')).toHaveTextContent('שולם (מדומה)')
    await userEvent.click(refund)
    await waitFor(() =>
      expect(within(panel()).getByRole('status')).toHaveTextContent('הוחזר (מדומה)'),
    )
    expect(within(panel()).queryByRole('button', { name: 'החזר כספי מדומה' })).toBeNull()
  })

  it('offers to try again after a decline, and says when a duplicate approval changed nothing', async () => {
    const order = await placed()
    renderApp(`/orders/${order.orderNumber}`, catalog)
    await screen.findByRole('region', { name: 'תשלום מדומה' })

    await userEvent.click(within(panel()).getByRole('button', { name: 'תשלום נדחה' }))
    const again = await within(panel()).findByRole(
      'group',
      { name: 'לנסות שוב' },
      { timeout: 3000 },
    )
    expect(within(panel()).getByRole('list', { name: 'ניסיונות התשלום' })).toHaveTextContent('נכשל')

    await userEvent.click(within(again).getByRole('button', { name: 'אישור כפול מהספק' }))
    expect(
      await within(panel()).findByText(
        'הספק שלח את האישור פעמיים. השני לא שינה דבר.',
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument()
    expect(within(panel()).getByRole('status')).toHaveTextContent('שולם (מדומה)')
  })

  it('says that an order placed before payments existed has none, and offers nothing', async () => {
    const order = await placed()
    delete api.orders()[0]!.payment
    api.orderControls().commit()
    renderApp(`/orders/${order.orderNumber}`, catalog)

    await screen.findByRole('region', { name: 'תשלום מדומה' })
    expect(panel()).toHaveTextContent('הזמנת הדגמה מלפני שנוסף התשלום המדומה')
    expect(within(panel()).queryAllByRole('button')).toEqual([])
  })

  it('says when no new attempt can start because the time is running out', async () => {
    api.setPaymentTimings({ settleDelayMs: 50, attemptTimeoutMs: 59_900, expiryMs: 60_000 })
    const order = await placed()
    await new Promise((resolve) => setTimeout(resolve, 150))
    renderApp(`/orders/${order.orderNumber}`, catalog)

    expect(
      await screen.findByText('לא ניתן להתחיל תשלום חדש: זמן התשלום מסתיים.'),
    ).toBeInTheDocument()
    expect(within(panel()).queryByRole('group')).toBeNull()
  })

  it('explains that the order stays waiting after three attempts that did not succeed, and offers no new one', async () => {
    const order = await placed()
    renderApp(`/orders/${order.orderNumber}`, catalog)
    await screen.findByRole('region', { name: 'תשלום מדומה' })

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await userEvent.click(await within(panel()).findByRole('button', { name: 'תשלום נדחה' }))
      await waitFor(
        () =>
          expect(within(panel()).getByRole('list', { name: 'ניסיונות התשלום' })).toHaveTextContent(
            `ניסיון ${attempt}: תשלום נדחה · נכשל`,
          ),
        { timeout: 3000 },
      )
    }

    expect(await within(panel()).findByText(/שלושת הניסיונות נוצלו/)).toHaveTextContent(
      'ההזמנה תישאר ממתינה לתשלום עד שזמן התשלום יפוג.',
    )
    expect(within(panel()).getByRole('status')).toHaveTextContent('ממתין לתשלום')
    expect(within(panel()).queryByRole('group')).toBeNull()
    expect(within(panel()).queryAllByRole('button')).toEqual([])
    expect(within(panel()).queryByText(/זמן התשלום מסתיים/)).toBeNull()
  })

  it('does not show that note while an attempt is left or processing', async () => {
    const order = await placed()
    renderApp(`/orders/${order.orderNumber}`, catalog)
    await screen.findByRole('region', { name: 'תשלום מדומה' })
    expect(within(panel()).queryByText(/שלושת הניסיונות נוצלו/)).toBeNull()

    await userEvent.click(within(panel()).getByRole('button', { name: 'תשלום נדחה' }))
    await within(panel()).findByRole('group', { name: 'לנסות שוב' }, { timeout: 3000 })
    expect(within(panel()).queryByText(/שלושת הניסיונות נוצלו/)).toBeNull()
  })

  it('says that no answer has come, with a reload, when the polling gave up on an attempt', async () => {
    api.setPaymentTimings({ settleDelayMs: 150, attemptTimeoutMs: 30_000, expiryMs: 60_000 })
    paymentPolling.limit = 3
    const order = await placed()
    renderApp(`/orders/${order.orderNumber}`, catalog)
    await screen.findByRole('region', { name: 'תשלום מדומה' })

    await userEvent.click(within(panel()).getByRole('button', { name: 'הספק לא עונה' }))

    expect(
      await within(panel()).findByText(
        'עדיין לא התקבלה תשובה מהספק המדומה.',
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument()
    expect(
      within(panel())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['רענון מצב התשלום', 'ביטול הניסיון'])
  })

  it('shows nothing about a payment that contradicts itself, offers no action, and only a reload', async () => {
    const order = await placed()
    const through = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await through(input, init)
      if (!String(input).endsWith(`/api/orders/${order.orderNumber}`)) return response
      const body = (await response.json()) as { payment: Record<string, unknown> }
      return new Response(
        JSON.stringify({ ...body, payment: { ...body.payment, state: 'paid' } }),
        {
          status: 200,
          headers: response.headers,
        },
      )
    })
    renderApp(`/orders/${order.orderNumber}`, catalog)

    expect(
      await screen.findByText(
        'מצב התשלום של ההזמנה הזו לא עקבי. רעננו את הדף. אם זה חוזר, זו תקלה.',
      ),
    ).toBeInTheDocument()
    expect(
      within(panel())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['רענון מצב התשלום'])
    expect(within(panel()).queryByRole('status')).toBeNull()
  })
})

describe('the payment in the list of orders', () => {
  it('shows where each payment stands, and says to open an order whose change is due', async () => {
    const waiting = await placed()
    const due = await placed()
    const token = useAuthStore.getState().token!
    await fetch(`http://localhost:3001/api/orders/${due.orderNumber}/payment/attempts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ scenario: 'approve' }),
    })
    await new Promise((resolve) => setTimeout(resolve, 250))
    renderApp('/orders', catalog)

    const list = await screen.findByRole('list', { name: 'ההזמנות שלי' })
    const cards = within(list).getAllByRole('listitem')
    const card = (number: string) => cards.find((item) => item.textContent?.includes(number))!
    expect(card(waiting.orderNumber)).toHaveTextContent('ממתין לתשלום')
    expect(card(due.orderNumber)).toHaveTextContent('בעיבוד')
    expect(card(due.orderNumber)).toHaveTextContent('פתחו את ההזמנה לעדכון המצב')
    expect(card(waiting.orderNumber)).not.toHaveTextContent('פתחו את ההזמנה')
  })

  it('says that an order placed before payments existed has none', async () => {
    await placed()
    delete api.orders()[0]!.payment
    api.orderControls().commit()
    renderApp('/orders', catalog)

    const list = await screen.findByRole('list', { name: 'ההזמנות שלי' })
    expect(list).toHaveTextContent('הזמנת הדגמה מלפני שנוסף התשלום המדומה')
  })
})
