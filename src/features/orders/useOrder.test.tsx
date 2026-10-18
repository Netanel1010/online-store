import { act, renderHook, waitFor } from '@testing-library/react'
import { useAuthStore } from '@/features/auth/authStore'
import { placeOrder } from '@/features/orders/orderService'
import { makeProduct } from '@/test/fixtures'
import { setUpAuthApi } from '@/test/authApi'
import { readPayment, type Order } from './orderSchema'
import { paymentPolling, useOrder } from './useOrder'

// The real orders API answers (see setUpAuthApi), with short payment timings so a test does not wait.
const api = setUpAuthApi()
const SHORT = { settleDelayMs: 150, attemptTimeoutMs: 600, expiryMs: 60_000 }
const product = makeProduct({ id: 'PSU-1', name: 'ספק כוח', price: { current: 1000 } })
const DELIVERY = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '050-1234567',
  city: 'חיפה',
  street: 'הנשיא',
  houseNumber: '12',
  apartment: '',
  postalCode: '',
  notes: '',
}

const defaults = { ...paymentPolling }
beforeEach(() => {
  api.setCatalog([product])
  api.setPaymentTimings(SHORT)
  paymentPolling.intervalMs = 30
})
afterEach(() => {
  Object.assign(paymentPolling, defaults)
})

async function signIn(email = 'netanel@example.com') {
  await useAuthStore.getState().register({ name: 'נתנאל', email, password: 'Passw0rdOK' })
}

async function placed(): Promise<Order> {
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

const paymentOf = (view: ReturnType<typeof useOrder>['view']) => {
  if (view.status !== 'ready') return undefined
  const read = readPayment(view.order)
  return read.kind === 'ok' ? read.payment : read.kind
}
const lastStatus = (view: ReturnType<typeof useOrder>['view']) => {
  const payment = paymentOf(view)
  return typeof payment === 'object' ? payment.attempts.at(-1)?.status : undefined
}

/** Puts a hand between the page and the API: `change` may rewrite or hold an answer. */
function intercept(
  change: (
    url: string,
    init: RequestInit | undefined,
    answer: () => Promise<Response>,
  ) => Promise<Response>,
) {
  const through = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    change(String(input), init, () => through(input, init)),
  )
}

describe('the payment of an order on its page', () => {
  it('shows the server answer, asks again while the provider decides, and stops once it has', async () => {
    await signIn()
    const order = await placed()
    const { result } = renderHook(() => useOrder(order.orderNumber))
    await waitFor(() => expect(result.current.view.status).toBe('ready'))
    expect(paymentOf(result.current.view)).toMatchObject({ state: 'awaiting', attempts: [] })

    act(() => result.current.payment.start('approve'))
    await waitFor(() => expect(lastStatus(result.current.view)).toBe('processing'))
    await waitFor(() => expect(lastStatus(result.current.view)).toBe('succeeded'), {
      timeout: 3000,
    })
    expect(paymentOf(result.current.view)).toMatchObject({ state: 'paid' })
    expect(result.current.payment.busy).toBe(false)
  })

  it('never shows the scenario that was picked as a result: only what the server answered', async () => {
    await signIn()
    const order = await placed()
    let release!: () => void
    intercept(async (url, init, answer) => {
      if (url.endsWith('/payment/attempts') && init?.method === 'POST') {
        await new Promise<void>((resolve) => (release = resolve))
      }
      return answer()
    })
    const { result } = renderHook(() => useOrder(order.orderNumber))
    await waitFor(() => expect(result.current.view.status).toBe('ready'))

    act(() => result.current.payment.start('approve'))
    await waitFor(() => expect(result.current.payment.busy).toBe(true))
    expect(paymentOf(result.current.view)).toMatchObject({ state: 'awaiting', attempts: [] })
    await act(async () => release())
    await waitFor(() => expect(lastStatus(result.current.view)).toBe('processing'))
  })

  it('shows another order from nothing: nothing from the first is carried over', async () => {
    await signIn()
    const first = await placed()
    const second = await placed()
    const { result, rerender } = renderHook(({ number }) => useOrder(number), {
      initialProps: { number: first.orderNumber },
    })
    await waitFor(() => expect(result.current.view.status).toBe('ready'))
    act(() => result.current.payment.start('approve'))
    await waitFor(() => expect(lastStatus(result.current.view)).toBe('succeeded'), {
      timeout: 3000,
    })

    rerender({ number: second.orderNumber })
    expect(result.current.view.status).toBe('loading')
    await waitFor(() => expect(result.current.view.status).toBe('ready'))
    expect(paymentOf(result.current.view)).toMatchObject({ state: 'awaiting', attempts: [] })
    expect(result.current.payment.inconsistent).toBe(false)
  })

  it('starts from nothing for another session, even for the same order number', async () => {
    await signIn()
    const order = await placed()
    const { result } = renderHook(() => useOrder(order.orderNumber))
    await waitFor(() => expect(result.current.view.status).toBe('ready'))

    await act(async () => {
      useAuthStore.getState().logout()
      await signIn('someone@example.com')
    })
    await waitFor(() => expect(result.current.view.status).toBe('not-found'))
  })

  it('drops an answer to a question asked for another order', async () => {
    await signIn()
    const first = await placed()
    const second = await placed()
    let releaseFirst!: () => void
    const gate = new Promise<void>((resolve) => (releaseFirst = resolve))
    let held = false
    const through = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith(`/api/orders/${first.orderNumber}`) && !held) {
        held = true
        // The answer comes even though the page gave up on it: only the page's own check drops it.
        const response = await through(input, { ...init, signal: null })
        await gate
        return response
      }
      return through(input, init)
    })
    const { result, rerender } = renderHook(({ number }) => useOrder(number), {
      initialProps: { number: first.orderNumber },
    })
    await waitFor(() => expect(held).toBe(true))

    rerender({ number: second.orderNumber })
    await waitFor(() => expect(result.current.view.status).toBe('ready'))
    await act(async () => releaseFirst())
    expect(result.current.view.status === 'ready' && result.current.view.order.orderNumber).toBe(
      second.orderNumber,
    )
  })

  it('keeps a later state when an older one comes from a lagging copy, and asks again', async () => {
    await signIn()
    const order = await placed()
    const { result } = renderHook(() => useOrder(order.orderNumber))
    await waitFor(() => expect(result.current.view.status).toBe('ready'))
    act(() => result.current.payment.start('approve'))
    await waitFor(() => expect(paymentOf(result.current.view)).toMatchObject({ state: 'paid' }), {
      timeout: 3000,
    })

    // The refund reaches the local copy only: its own answer says refunded, later reads say paid.
    api.orderControls().autoCommit = false
    act(() => result.current.payment.refund())
    await waitFor(() => expect(paymentOf(result.current.view)).toMatchObject({ state: 'refunded' }))
    let reads = 0
    intercept(async (url, init, answer) => {
      if (url.endsWith(`/api/orders/${order.orderNumber}`) && !init?.method) reads += 1
      return answer()
    })
    // A refused cancel makes the page read the order: the majority still says paid.
    act(() => result.current.payment.cancel(1))
    await waitFor(() => expect(reads).toBeGreaterThan(0))
    await waitFor(() => expect(result.current.payment.busy).toBe(false))
    expect(paymentOf(result.current.view)).toMatchObject({ state: 'refunded' })
    expect(result.current.payment.inconsistent).toBe(false)

    reads = 0
    act(() => result.current.payment.reload())
    await waitFor(() => expect(result.current.view.status).toBe('ready'))
    // After a reload nothing is shown before, so the majority's paid is what there is.
    expect(paymentOf(result.current.view)).toMatchObject({ state: 'paid' })
    expect(reads).toBeGreaterThan(0)
  })

  it('stops on an answer that contradicts what is shown, does nothing more, and starts over on reload', async () => {
    await signIn()
    const order = await placed()
    const { result } = renderHook(() => useOrder(order.orderNumber))
    await waitFor(() => expect(result.current.view.status).toBe('ready'))
    act(() => result.current.payment.start('approve'))
    await waitFor(() => expect(paymentOf(result.current.view)).toMatchObject({ state: 'paid' }), {
      timeout: 3000,
    })

    // An answer that says the paid order expired instead (impossible from this server).
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let posts = 0
    let rewrite = true
    intercept(async (url, init, answer) => {
      if (init?.method === 'POST') posts += 1
      const response = await answer()
      if (!rewrite || !url.endsWith(`/api/orders/${order.orderNumber}`) || init?.method)
        return response
      const body = (await response.json()) as { payment: Record<string, unknown> }
      const attempts = body.payment.attempts as Record<string, unknown>[]
      const contradicting = {
        ...body,
        payment: {
          ...body.payment,
          state: 'expired',
          paidAt: undefined,
          attempts: attempts.map((attempt) => ({ ...attempt, status: 'failed' })),
        },
      }
      return new Response(JSON.stringify(contradicting), { status: 200, headers: response.headers })
    })
    // Asked again through the payment (a cancel is refused, then the page reads the order).
    act(() => result.current.payment.cancel(1))
    await waitFor(() => expect(result.current.payment.inconsistent).toBe(true))
    expect(paymentOf(result.current.view)).toMatchObject({ state: 'paid' })
    expect(error).toHaveBeenCalledWith(
      'The payment of the order contradicts what was shown',
      expect.objectContaining({ newRequestId: expect.anything() }),
    )

    const before = posts
    act(() => result.current.payment.refund())
    expect(posts).toBe(before)

    rewrite = false
    act(() => result.current.payment.reload())
    await waitFor(() => expect(result.current.payment.inconsistent).toBe(false))
    await waitFor(() => expect(paymentOf(result.current.view)).toMatchObject({ state: 'paid' }))
    error.mockRestore()
  })

  it('stops asking after its limit while the provider does not answer', async () => {
    paymentPolling.limit = 3
    api.setPaymentTimings({ settleDelayMs: 150, attemptTimeoutMs: 50_000, expiryMs: 600_000 })
    await signIn()
    const order = await placed()
    const { result } = renderHook(() => useOrder(order.orderNumber))
    await waitFor(() => expect(result.current.view.status).toBe('ready'))

    let reads = 0
    intercept(async (url, init, answer) => {
      if (url.endsWith(`/api/orders/${order.orderNumber}`) && !init?.method) reads += 1
      return answer()
    })
    act(() => result.current.payment.start('no_answer'))
    await waitFor(() => expect(result.current.payment.waitingTooLong).toBe(true), { timeout: 3000 })
    expect(lastStatus(result.current.view)).toBe('processing')
    // And it does stop: no question in ten more intervals.
    const asked = reads
    expect(asked).toBe(3)
    await new Promise((resolve) => setTimeout(resolve, paymentPolling.intervalMs * 10))
    expect(reads).toBe(asked)
  })

  it('sends a start whose answer was lost again with the same key, and makes one attempt', async () => {
    await signIn()
    const order = await placed()
    const keys: string[] = []
    let lose = true
    intercept(async (url, init, answer) => {
      if (url.endsWith('/payment/attempts') && init?.method === 'POST') {
        keys.push(new Headers(init.headers).get('Idempotency-Key')!)
        const response = await answer()
        if (lose) {
          lose = false
          throw new TypeError('Failed to fetch')
        }
        return response
      }
      return answer()
    })
    const { result } = renderHook(() => useOrder(order.orderNumber))
    await waitFor(() => expect(result.current.view.status).toBe('ready'))

    act(() => result.current.payment.start('decline'))
    await waitFor(() => expect(result.current.payment.feedback).toBe('unavailable'))
    await waitFor(() => expect(result.current.payment.busy).toBe(false))
    act(() => result.current.payment.start('decline'))
    await waitFor(() => expect(keys).toHaveLength(2))
    expect(keys[1]).toBe(keys[0])
    await waitFor(() => expect(api.orders()[0]!.payment!.attempts).toHaveLength(1))
  })

  it('keeps nothing in the browser storage', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem')
    await signIn()
    const order = await placed()
    local.mockClear()
    const { result } = renderHook(() => useOrder(order.orderNumber))
    await waitFor(() => expect(result.current.view.status).toBe('ready'))
    act(() => result.current.payment.start('approve'))
    await waitFor(() => expect(lastStatus(result.current.view)).toBe('succeeded'), {
      timeout: 3000,
    })

    const keys = local.mock.calls.map(([key]) => key)
    expect(keys.filter((key) => /order|payment/i.test(key))).toEqual([])
    local.mockRestore()
  })
})
