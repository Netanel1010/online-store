import type { CheckoutValues } from '@/features/checkout/schema'
import { fetchPolicy } from '@/lib/fetchWithRetry'
import {
  forgetAllCheckoutAttempts,
  forgetCheckoutAttempt,
  unresolvedAttemptKey,
} from './checkoutAttempt'
import { submitOrder } from './submitOrder'

const TOKEN = 'T'.repeat(43)
const USER = 'user-1'
const ITEMS = [{ productId: 'A-1', quantity: 2 }]

const VALUES = {
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
} as CheckoutValues
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

const json = (body: unknown, status: number) => Response.json(body, { status })
const refusal = (status: number, code: string, details?: Record<string, unknown>) =>
  json({ error: { code, message: 'x', ...(details && { details }) } }, status)

const submit = (overrides: Partial<Parameters<typeof submitOrder>[0]> = {}) =>
  submitOrder({
    token: TOKEN,
    userId: USER,
    items: ITEMS,
    values: VALUES,
    expectedTotal: 1500,
    ...overrides,
  })

/** Answers the order requests in turn; returns the keys and bodies that were sent. */
function answers(...replies: (() => Response | Promise<Response>)[]) {
  const sent: { key: string; delivery: { street: string }; items: unknown }[] = []
  let next = 0
  vi.stubGlobal('fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>
    const body = JSON.parse(init?.body as string)
    sent.push({ key: headers['Idempotency-Key']!, delivery: body.delivery, items: body.items })
    const reply = replies[Math.min(next, replies.length - 1)]!
    next += 1
    return reply()
  })
  return sent
}

const original = [...fetchPolicy.delaysMs]
afterEach(() => {
  vi.unstubAllGlobals()
  fetchPolicy.delaysMs = original
  forgetAllCheckoutAttempts()
})

describe('submitOrder: the key of an attempt', () => {
  it('keeps the key even when the order exists: only the caller knows whose order it is', async () => {
    answers(() => json(ORDER, 201))

    const outcome = await submit()

    expect(outcome).toEqual({ ok: true, order: ORDER })
    expect(unresolvedAttemptKey(USER)).not.toBeNull()
  })

  it.each([
    ['a lost answer', () => Promise.reject(new TypeError('the answer was lost'))],
    ['a 500', () => refusal(500, 'internal_error')],
    ['a 503', () => refusal(503, 'server_busy')],
    ['an answer that is not JSON', () => new Response('<html>', { status: 201 })],
    ['a changed price', () => refusal(409, 'price_changed', { expectedTotal: 1500, total: 1800 })],
    ['an unavailable product', () => refusal(409, 'product_unavailable', { productIds: ['A-1'] })],
    ['a refusal of the details', () => refusal(400, 'invalid_input')],
    ['a rate limit', () => refusal(429, 'rate_limited')],
    ['an ended session', () => refusal(401, 'unauthorized')],
    [
      'a key that already made an order',
      () => refusal(409, 'idempotency_key_reuse', { orderNumber: ORDER.orderNumber }),
    ],
    [
      'a key that made an order, named by an older API',
      () => refusal(409, 'idempotency_key_reuse'),
    ],
  ])('keeps the key after %s: the attempt is not resolved', async (_name, reply) => {
    answers(reply)

    const outcome = await submit()

    expect(outcome.ok).toBe(false)
    expect(unresolvedAttemptKey(USER)).not.toBeNull()
  })

  it('sends the same key again after a lost answer, whatever was edited meanwhile', async () => {
    const sent = answers(
      () => Promise.reject(new TypeError('the answer was lost')),
      () => refusal(409, 'idempotency_key_reuse', { orderNumber: ORDER.orderNumber }),
    )

    await submit()
    const edited = await submit({ values: { ...VALUES, street: 'אחרת' } })

    expect(sent).toHaveLength(2)
    expect(sent[1]!.key).toBe(sent[0]!.key)
    // The edit was sent, not silently dropped: it is the API that refused it, naming the order.
    expect(sent[1]!.delivery.street).toBe('אחרת')
    expect(edited).toEqual({ ok: false, reason: 'key-reused', orderNumber: ORDER.orderNumber })
  })

  it('sends the same key again after a lost answer, whatever was changed in the cart meanwhile', async () => {
    const sent = answers(
      () => Promise.reject(new TypeError('lost')),
      () => json(ORDER, 201),
    )

    await submit()
    await submit({ items: [{ productId: 'B-2', quantity: 1 }], expectedTotal: 900 })

    expect(sent[1]!.key).toBe(sent[0]!.key)
    expect(sent[1]!.items).toEqual([{ productId: 'B-2', quantity: 1 }])
  })

  it('places an edited order when the first request never arrived, with the edited details', async () => {
    const sent = answers(
      () => Promise.reject(new TypeError('network down')),
      () => json(ORDER, 201),
    )

    await submit()
    const second = await submit({ values: { ...VALUES, street: 'אחרת' } })

    expect(second.ok).toBe(true)
    expect(sent.map((request) => request.delivery.street)).toEqual(['הנשיא', 'אחרת'])
  })

  it('uses a new key for the next order once the caller has resolved the attempt', async () => {
    const sent = answers(() => json(ORDER, 201))

    await submit()
    forgetCheckoutAttempt(USER)
    await submit()

    expect(sent[1]!.key).not.toBe(sent[0]!.key)
  })

  it('uses a key of its own for another account', async () => {
    const sent = answers(() => Promise.reject(new TypeError('lost')))

    await submit()
    await submit({ userId: 'user-2' })

    expect(sent[1]!.key).not.toBe(sent[0]!.key)
  })

  it('gives the first account its own key again after another account ordered in between', async () => {
    const sent = answers(() => Promise.reject(new TypeError('lost')))

    await submit({ userId: 'user-1' })
    await submit({ userId: 'user-2' })
    await submit({ userId: 'user-1' })

    expect(sent[1]!.key).not.toBe(sent[0]!.key)
    expect(sent[2]!.key).toBe(sent[0]!.key)
    expect(unresolvedAttemptKey('user-2')).toBe(sent[1]!.key)
  })

  it('lets the caller resolve one account and leave the other attempt alone', async () => {
    const sent = answers(
      () => Promise.reject(new TypeError('lost')),
      () => json(ORDER, 201),
    )

    await submit({ userId: 'user-1' })
    const second = await submit({ userId: 'user-2' })
    forgetCheckoutAttempt('user-2')

    expect(second.ok).toBe(true)
    expect(unresolvedAttemptKey('user-2')).toBeNull()
    expect(unresolvedAttemptKey('user-1')).toBe(sent[0]!.key)
  })

  it('repeats the request inside one call with the same key when the host is busy', async () => {
    fetchPolicy.delaysMs = [0]
    const sent = answers(
      () => refusal(503, 'server_busy'),
      () => json(ORDER, 201),
    )

    const outcome = await submit()

    expect(outcome.ok).toBe(true)
    expect(sent).toHaveLength(2)
    expect(sent[1]!.key).toBe(sent[0]!.key)
  })
})

describe('submitOrder: one request at a time per session', () => {
  const ORDER_B = { ...ORDER, orderNumber: 'DEMO-B2B2B2B2' }

  /** The first reply waits for `release()`; the others answer at once. */
  function holdFirstReply(...later: (() => Response)[]) {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const sent = answers(
      async () => {
        await gate
        return json(ORDER, 201)
      },
      ...later,
    )
    return { sent, release: () => release() }
  }

  it('does not give an account the answer to the request of another account that is on its way', async () => {
    const { sent, release } = holdFirstReply(() => json(ORDER_B, 201))

    const first = submit({ userId: 'user-1', token: 'A'.repeat(43) })
    const second = await submit({ userId: 'user-2', token: 'B'.repeat(43) })

    // The second account sent a request of its own and got its own order, while the first is still waiting.
    expect(sent).toHaveLength(2)
    expect(second).toEqual({ ok: true, order: ORDER_B })
    release()
    expect(await first).toEqual({ ok: true, order: ORDER })
    expect(sent[0]!.key).not.toBe(sent[1]!.key)
  })

  it('does not give the same account the request of an earlier session either', async () => {
    const { sent, release } = holdFirstReply(() => json(ORDER_B, 201))

    const earlier = submit({ token: 'A'.repeat(43) })
    const later = await submit({ token: 'B'.repeat(43) })

    expect(sent).toHaveLength(2)
    expect(later.ok && later.order.orderNumber).toBe(ORDER_B.orderNumber)
    release()
    expect((await earlier).ok).toBe(true)
  })

  it('still joins a second submit of a session after another account sent its own', async () => {
    const { sent, release } = holdFirstReply(() => json(ORDER_B, 201))

    const first = submit({ userId: 'user-1', token: 'A'.repeat(43) })
    await submit({ userId: 'user-2', token: 'B'.repeat(43) })
    const again = submit({ userId: 'user-1', token: 'A'.repeat(43) })
    release()

    expect(await again).toEqual(await first)
    expect(sent).toHaveLength(2)
  })

  it('keeps the key of the account whose order came back late, so it can be found when that account returns', async () => {
    const { sent, release } = holdFirstReply(() => Promise.reject(new TypeError('lost')) as never)

    const late = submit({ userId: 'user-1', token: 'A'.repeat(43) })
    await submit({ userId: 'user-2', token: 'B'.repeat(43) })
    release()
    expect((await late).ok).toBe(true)

    expect(unresolvedAttemptKey('user-1')).toBe(sent[0]!.key)
    expect(unresolvedAttemptKey('user-2')).toBe(sent[1]!.key)
  })

  it('sends one request for a double click, and gives both calls the same answer', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const sent = answers(async () => {
      await gate
      return json(ORDER, 201)
    })

    const first = submit()
    const second = submit()
    release()

    expect(await first).toEqual({ ok: true, order: ORDER })
    expect(await second).toEqual({ ok: true, order: ORDER })
    expect(sent).toHaveLength(1)
  })

  it('sends again once the request is over', async () => {
    const sent = answers(() => Promise.reject(new TypeError('lost')))

    await submit()
    await submit()

    expect(sent).toHaveLength(2)
  })
})
