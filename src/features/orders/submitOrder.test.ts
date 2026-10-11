import type { CheckoutValues } from '@/features/checkout/schema'
import { readPendingAttempt } from './checkoutAttempt'
import { checkoutRecoveryPolicy, submitOrder } from './submitOrder'

const TOKEN = 'T'.repeat(43)
const START = 1_700_000_000_000
const SETTLE = 30_000

const VALUES: CheckoutValues = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '050-1234567',
  city: 'חיפה',
  street: 'הנשיא',
  houseNumber: '12',
  apartment: '',
  postalCode: '',
  notes: '',
  acceptDemo: true,
}
const ITEMS = [{ productId: 'A-1', quantity: 2 }]
const ORDER = {
  orderNumber: 'DEMO-7K2M9QX4',
  createdAt: '2026-01-01T10:00:00.000Z',
  status: 'placed',
  lines: [{ productId: 'A-1', name: 'כרטיס מסך', unitPrice: 750, quantity: 2 }],
  total: 1500,
  originalTotal: 1500,
  savings: 0,
  delivery: { ...VALUES, acceptDemo: undefined },
}

/** The time of the test: a submission reads it when it starts and when an answer is lost. */
let time = START
const clock = () => time

const submit = (over: { values?: Partial<CheckoutValues>; now?: number } = {}) => {
  time = over.now ?? START
  return submitOrder({
    token: TOKEN,
    userId: 'user-1',
    items: ITEMS,
    values: { ...VALUES, ...over.values },
    expectedTotal: 1500,
    clock,
  })
}

type Answer = Response | Error
/** Answers the order requests and the lookups in turn; records which address each one went to. */
function stubApi({ orders = [], lookups = [] }: { orders?: Answer[]; lookups?: Answer[] }) {
  const calls: string[] = []
  const queue = { orders: [...orders], lookups: [...lookups] }
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input)
    const which = url.endsWith('/api/orders/lookup') ? 'lookups' : 'orders'
    calls.push(which === 'lookups' ? 'lookup' : 'order')
    const answer = queue[which].shift()
    if (answer === undefined) throw new Error(`unexpected ${which} request to ${url}`)
    if (answer instanceof Error) throw answer
    return answer
  })
  return calls
}
const json = (body: unknown, status: number) => Response.json(body, { status })
const refusal = (status: number, code: string, details?: Record<string, unknown>) =>
  json({ error: { code, message: code, ...(details && { details }) } }, status)
const lost = () => new TypeError('network down')

/** A first submission whose answer was lost, so that the next one has something to resolve. */
async function loseAnAnswer() {
  stubApi({ orders: [lost()] })
  expect(await submit()).toEqual({ ok: false, reason: 'unavailable' })
}

beforeEach(() => {
  checkoutRecoveryPolicy.settleMs = SETTLE
})
afterEach(() => {
  checkoutRecoveryPolicy.settleMs = 0
  vi.unstubAllGlobals()
})

describe('what a submission remembers about the request', () => {
  it('has nothing pending once the order exists', async () => {
    stubApi({ orders: [json(ORDER, 201)] })

    expect(await submit()).toEqual({ ok: true, order: ORDER })

    expect(readPendingAttempt(START)).toBeNull()
    expect(localStorage.getItem('online-store:checkout-attempt')).toBeNull()
  })

  it('is pending, from the moment of the last try, after an answer that was lost', async () => {
    await loseAnAnswer()

    expect(readPendingAttempt(START)).toMatchObject({ since: START })
  })

  it('is pending after a server error too, as the order may have been made before it failed', async () => {
    stubApi({ orders: [refusal(500, 'internal_error')] })

    expect(await submit()).toEqual({ ok: false, reason: 'unavailable' })

    expect(readPendingAttempt(START)).not.toBeNull()
  })

  it.each([
    ['a price that changed', refusal(409, 'price_changed', { total: 1600 })],
    ['a product that is gone', refusal(409, 'product_unavailable', { productIds: ['A-1'] })],
    ['a body the API refused', refusal(400, 'invalid_input')],
    ['an ended session', refusal(401, 'unauthorized')],
    ['a limit on orders', refusal(429, 'rate_limited')],
  ])('is not pending after %s: the API said it made no order', async (_name, answer) => {
    stubApi({ orders: [answer] })

    await submit()

    expect(readPendingAttempt(START)).toBeNull()
    expect(localStorage.getItem('online-store:checkout-attempt')).not.toBeNull() // the key stays
  })

  it('forgets a key that the API says belongs to another order', async () => {
    stubApi({ orders: [refusal(409, 'idempotency_key_reuse')] })

    await submit()

    expect(localStorage.getItem('online-store:checkout-attempt')).toBeNull()
  })
})

describe('the same order sent again after an answer was lost', () => {
  it('goes straight to the API with the same key, without asking about it first', async () => {
    await loseAnAnswer()
    const calls = stubApi({ orders: [json(ORDER, 200)] })

    expect(await submit({ now: START + 1_000 })).toEqual({ ok: true, order: ORDER })

    expect(calls).toEqual(['order'])
  })
})

describe('a different order sent after an answer was lost', () => {
  it('returns the order that exists, forgets the attempt, and sends nothing new', async () => {
    await loseAnAnswer()
    const calls = stubApi({ lookups: [json(ORDER, 200)] })

    const outcome = await submit({ values: { phone: '052-7654321' }, now: START + 1_000 })

    expect(outcome).toEqual({ ok: true, order: ORDER, recovered: true })
    expect(calls).toEqual(['lookup'])
    expect(localStorage.getItem('online-store:checkout-attempt')).toBeNull()
  })

  it('does the same when the products were changed and not the address', async () => {
    await loseAnAnswer()
    const calls = stubApi({ lookups: [json(ORDER, 200)] })

    time = START + 1_000
    const outcome = await submitOrder({
      token: TOKEN,
      userId: 'user-1',
      items: [{ productId: 'A-1', quantity: 3 }],
      values: VALUES,
      expectedTotal: 2250,
      clock,
    })

    expect(outcome).toMatchObject({ ok: true, recovered: true })
    expect(calls).toEqual(['lookup'])
  })

  it('waits while the earlier request may still be arriving, and keeps the attempt to ask again', async () => {
    await loseAnAnswer()
    const calls = stubApi({ lookups: [refusal(404, 'order_not_found')] })

    const outcome = await submit({ values: { phone: '052-7654321' }, now: START + SETTLE - 1 })

    expect(outcome).toEqual({ ok: false, reason: 'still-checking' })
    expect(calls).toEqual(['lookup'])
    expect(readPendingAttempt(START + SETTLE - 1)).not.toBeNull()
  })

  it('orders with the edited details, under a new key, once the wait is over and no order exists', async () => {
    await loseAnAnswer()
    const firstKey = JSON.parse(localStorage.getItem('online-store:checkout-attempt')!).key
    const calls = stubApi({
      lookups: [refusal(404, 'order_not_found')],
      orders: [json(ORDER, 201)],
    })

    const outcome = await submit({ values: { phone: '052-7654321' }, now: START + SETTLE })

    expect(outcome).toEqual({ ok: true, order: ORDER })
    expect(calls).toEqual(['lookup', 'order'])
    expect(localStorage.getItem('online-store:checkout-attempt')).toBeNull()
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('counts the wait from the last time the answer was lost, not from the first try', async () => {
    await loseAnAnswer()
    stubApi({ orders: [lost()] })
    await submit({ now: START + 100_000 }) // the same order again, the answer lost again
    const calls = stubApi({ lookups: [refusal(404, 'order_not_found')] })

    // 101 s after the first try, but only a second after the last one.
    const outcome = await submit({ values: { phone: '052-7654321' }, now: START + 101_000 })

    expect(outcome).toEqual({ ok: false, reason: 'still-checking' })
    expect(calls).toEqual(['lookup'])
  })

  it.each([
    ['cannot be reached', lost()],
    ['fails', refusal(500, 'internal_error')],
    ['is busy', refusal(503, 'server_busy')],
    ['answers something that is not an order', json({ nonsense: true }, 200)],
  ])('sends nothing when the lookup %s, and keeps the attempt', async (_name, answer) => {
    await loseAnAnswer()
    const calls = stubApi({ lookups: [answer] })

    const outcome = await submit({ values: { phone: '052-7654321' }, now: START + 2 * SETTLE })

    expect(outcome).toEqual({ ok: false, reason: 'cannot-verify' })
    expect(calls).toEqual(['lookup'])
    expect(readPendingAttempt(START + 2 * SETTLE)).not.toBeNull()
  })

  // The site is deployed before the API: until the API has the lookup route it answers 404 to it.
  it.each([
    ['a route the API does not have', () => refusal(404, 'not_found')],
    ['a page that is not the API', () => new Response('<html>Not Found</html>', { status: 404 })],
    ['an empty answer', () => new Response(null, { status: 404 })],
  ])(
    'sends nothing, even after the wait, when a 404 comes from %s: it does not say that no order exists',
    async (_name, answer) => {
      await loseAnAnswer()
      const calls = stubApi({ lookups: [answer()] })

      const outcome = await submit({ values: { phone: '052-7654321' }, now: START + 2 * SETTLE })

      expect(outcome).toEqual({ ok: false, reason: 'cannot-verify' })
      expect(calls).toEqual(['lookup']) // no order request followed
      expect(readPendingAttempt(START + 2 * SETTLE)).not.toBeNull() // the earlier key is kept
    },
  )

  it('reports an ended session, and sends nothing', async () => {
    await loseAnAnswer()
    const calls = stubApi({ lookups: [refusal(401, 'unauthorized')] })

    const outcome = await submit({ values: { phone: '052-7654321' }, now: START + 2 * SETTLE })

    expect(outcome).toEqual({ ok: false, reason: 'unauthorized' })
    expect(calls).toEqual(['lookup'])
  })

  it('does not ask about an attempt that is a day old: nobody retries after that long', async () => {
    await loseAnAnswer()
    const calls = stubApi({ orders: [json(ORDER, 201)] })

    const outcome = await submit({
      values: { phone: '052-7654321' },
      now: START + 24 * 60 * 60 * 1000,
    })

    expect(outcome).toEqual({ ok: true, order: ORDER })
    expect(calls).toEqual(['order'])
  })

  it('does not ask about an attempt of another account on a shared browser', async () => {
    await loseAnAnswer()
    const calls = stubApi({
      lookups: [refusal(404, 'order_not_found')],
      orders: [json(ORDER, 201)],
    })

    time = START + SETTLE
    const outcome = await submitOrder({
      token: TOKEN,
      userId: 'user-2',
      items: ITEMS,
      values: VALUES,
      expectedTotal: 1500,
      clock,
    })

    // It is asked, in the new account's name, so the other account's order is never shown to it.
    expect(outcome).toEqual({ ok: true, order: ORDER })
    expect(calls).toEqual(['lookup', 'order'])
  })
})
