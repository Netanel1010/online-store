import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/features/auth/authStore'
import {
  cancelPaymentAttempt,
  fetchOrder,
  refundPayment,
  startPayment,
  type PaymentCommandOutcome,
} from './orderService'
import { paymentIsMoving, readPayment, type Order } from './orderSchema'
import { comparePayments, type PaymentScenario } from './payment'

/** How often the page asks again while the fictional provider has not decided, and for how long. */
export const paymentPolling = { intervalMs: 1_000, limit: 40 }

export type OrderView =
  | { status: 'loading' }
  | { status: 'ready'; order: Order }
  /** No such order in this account (it does not exist, or it is somebody else's). */
  | { status: 'not-found' }
  /** The API could not be asked, or failed: nothing is known about the order. */
  | { status: 'unavailable' }

/** The simulated payment of the order on the page: what can be done with it, and what went wrong. */
export interface OrderPayment {
  /**
   * Two answers about the payment contradicted each other, or one contradicted itself: nothing on
   * the page about the payment can be trusted, and nothing can be done with it, until `reload`.
   */
  inconsistent: boolean
  /** A command is on its way. */
  busy: boolean
  /** The provider has not decided after as many questions as the page asks: it stopped asking. */
  waitingTooLong: boolean
  /** The last command got no answer that settles it, or was refused for asking too often. */
  feedback: 'unavailable' | 'too-many-requests' | null
  start(scenario: PaymentScenario): void
  cancel(attemptNumber: number): void
  refund(): void
  /** Forgets what is shown and reads the order again. */
  reload(): void
}

/** Everything the page shows and knows, for one session and one order: another starts from nothing. */
interface Shown {
  identity: string
  view: OrderView
  /** The `X-Request-Id` of the answer the payment on the page comes from. */
  requestId?: string
  inconsistent: boolean
  /** Raised by every answer, even one that changes nothing on the page: the next question is planned from it. */
  answers: number
  /** How many times the page has asked again since the last command. */
  polls: number
  busy: boolean
  feedback: OrderPayment['feedback']
}

const LOADING: OrderView = { status: 'loading' }

const fresh = (identity: string, view: OrderView): Shown => ({
  identity,
  view,
  inconsistent: false,
  answers: 1,
  polls: 0,
  busy: false,
  feedback: null,
})

/**
 * How a newer order relates to the one on the page, for its payment: show it, keep what is shown
 * (an older answer from a copy of the database that is behind), or stop (they cannot both be true).
 */
function relate(shown: Order, next: Order): 'forward' | 'lag' | 'contradiction' {
  const before = readPayment(shown)
  const after = readPayment(next)
  if (after.kind === 'malformed') return 'contradiction'
  if (before.kind === 'legacy' && after.kind === 'legacy') return 'forward'
  if (before.kind === 'ok' && after.kind === 'ok') {
    return comparePayments(before.payment, after.payment)
  }
  return 'contradiction'
}

/**
 * One of the signed-in account's orders, read from the API, and its simulated payment. The order is
 * never taken from the address or the router's state, so it opens the same after a reload, in another
 * tab, or from a link. If the API says the session is over, the visitor is signed out here too, which
 * sends them to the login page and back.
 *
 * The server decides the payment; the page only shows what it answers. While an attempt is processing
 * it asks again every second, for a limited time. Every answer is compared with what is shown, for this
 * session and this order only (ADR 0014): a later one is shown, an older one (a lagging copy of the
 * database) is kept back and asked again, and one that contradicts what is shown stops the payment part
 * of the page until it is reloaded. An answer to a question asked for another session or order, or
 * before a newer question, is dropped. Nothing of this is kept anywhere but in the page.
 */
export function useOrder(orderNumber: string): {
  view: OrderView
  retry: () => void
  payment: OrderPayment
} {
  const token = useAuthStore((state) => state.token)
  const identity = token ? `${token}|${orderNumber}` : null

  const [shown, setShown] = useState<Shown | null>(null)
  const [generation, setGeneration] = useState(0)

  /** What was rendered last, for the callbacks that run later (answers, commands). */
  const current = useRef<{ identity: string | null; shown: Shown | null }>({
    identity: null,
    shown: null,
  })
  useEffect(() => {
    current.current = { identity, shown }
  })
  /** The newest question: an answer to any other is dropped. */
  const latest = useRef(0)
  const inFlight = useRef<AbortController | null>(null)
  /** The key of a start whose answer was lost, kept so that sending it again cannot make a second attempt. */
  const pendingStart = useRef<{ scenario: PaymentScenario; key: string } | null>(null)

  const isCurrent = (asked: string, question: number) =>
    asked === current.current.identity && question === latest.current

  /** Applies an order the server sent, for the question `question` of `asked` (session and order). */
  const apply = useCallback((asked: string, question: number, order: Order, requestId?: string) => {
    if (!isCurrent(asked, question)) return
    const previous = current.current.shown
    if (!previous || previous.identity !== asked || previous.view.status !== 'ready') {
      setShown({
        ...fresh(asked, { status: 'ready', order }),
        ...(requestId && { requestId }),
        inconsistent: readPayment(order).kind === 'malformed',
      })
      return
    }
    if (previous.inconsistent) return
    const relation = relate(previous.view.order, order)
    if (relation === 'contradiction') {
      console.error('The payment of the order contradicts what was shown', {
        shownRequestId: previous.requestId,
        newRequestId: requestId,
      })
    }
    setShown({
      ...previous,
      ...(relation === 'forward' && {
        view: { status: 'ready', order },
        ...(requestId && { requestId }),
      }),
      inconsistent: relation === 'contradiction',
      answers: previous.answers + 1,
    })
  }, [])

  /** Asks for the order. Leaves what is shown as it is when a later question fails. */
  const load = useCallback(() => {
    if (!token || !identity) return
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    const question = (latest.current += 1)
    const asked = identity

    fetchOrder(token, orderNumber, controller.signal)
      .then((outcome) => {
        if (controller.signal.aborted) return
        if (outcome.status === 'unauthorized') {
          useAuthStore.getState().logout()
          return
        }
        if (outcome.status === 'ok') {
          apply(asked, question, outcome.order, outcome.requestId)
          return
        }
        if (!isCurrent(asked, question)) return
        const previous = current.current.shown
        if (previous?.identity === asked && previous.view.status === 'ready') {
          // A failed question while the order is on the page: keep it, and ask again later.
          setShown({ ...previous, answers: previous.answers + 1 })
          return
        }
        setShown(fresh(asked, outcome))
      })
      .catch(() => {
        // Only a question the page cancelled rejects; nobody is waiting for it.
      })
  }, [token, identity, orderNumber, apply])

  // A new session or order starts from nothing: nothing shown for another is carried over.
  useEffect(() => {
    pendingStart.current = null
    load()
    return () => {
      inFlight.current?.abort()
      latest.current += 1
    }
  }, [load, generation])

  const mine = shown?.identity === identity ? shown : null
  const view: OrderView = mine ? mine.view : LOADING
  const moving =
    mine !== null &&
    view.status === 'ready' &&
    !mine.inconsistent &&
    !mine.busy &&
    paymentIsMoving(view.order)
  const polls = mine?.polls ?? 0
  const answers = mine?.answers ?? 0

  // While the provider has not decided, ask again, a limited number of times.
  useEffect(() => {
    if (!moving || polls >= paymentPolling.limit) return
    const timer = setTimeout(() => {
      setShown((previous) => (previous ? { ...previous, polls: previous.polls + 1 } : previous))
      load()
    }, paymentPolling.intervalMs)
    return () => clearTimeout(timer)
  }, [moving, polls, answers, load])

  const run = useCallback(
    async (send: (token: string, signal: AbortSignal) => Promise<PaymentCommandOutcome>) => {
      const state = current.current.shown
      if (!token || !identity || !state || state.identity !== identity) return
      if (state.busy || state.inconsistent || state.view.status !== 'ready') return
      // The command's answer is the newest: a question already on its way is dropped.
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      const question = (latest.current += 1)
      const asked = identity
      const settle = (feedback: OrderPayment['feedback']) =>
        setShown((previous) =>
          previous?.identity === asked
            ? { ...previous, busy: false, polls: 0, feedback }
            : previous,
        )
      setShown({ ...state, busy: true, feedback: null })
      current.current = { ...current.current, shown: { ...state, busy: true, feedback: null } }
      let feedback: OrderPayment['feedback'] = null
      try {
        const outcome = await send(token, controller.signal)
        if (controller.signal.aborted || asked !== current.current.identity) return
        if (outcome.ok) {
          apply(asked, question, outcome.order, outcome.requestId)
          return
        }
        if (outcome.reason === 'unauthorized') {
          useAuthStore.getState().logout()
          return
        }
        if (outcome.reason === 'unavailable' || outcome.reason === 'too-many-requests') {
          feedback = outcome.reason
        }
        // Whatever it was, what the server has now is what the page shows next.
        load()
      } catch {
        // The page was left.
      } finally {
        settle(feedback)
      }
    },
    [token, identity, apply, load],
  )

  const payment = useMemo<OrderPayment>(
    () => ({
      inconsistent: mine?.inconsistent ?? false,
      busy: mine?.busy ?? false,
      waitingTooLong:
        mine !== null &&
        view.status === 'ready' &&
        !mine.inconsistent &&
        mine.polls >= paymentPolling.limit &&
        paymentIsMoving(view.order),
      feedback: mine?.feedback ?? null,
      start: (scenario) => {
        const key =
          pendingStart.current?.scenario === scenario
            ? pendingStart.current.key
            : crypto.randomUUID()
        pendingStart.current = { scenario, key }
        void run(async (secret, signal) => {
          const outcome = await startPayment(secret, orderNumber, key, scenario, signal)
          // Only an answer that settles it frees the key; after a lost answer it is sent again.
          if (outcome.ok || outcome.reason !== 'unavailable') pendingStart.current = null
          return outcome
        })
      },
      cancel: (attemptNumber) => {
        void run((secret, signal) =>
          cancelPaymentAttempt(secret, orderNumber, attemptNumber, signal),
        )
      },
      refund: () => {
        void run((secret, signal) => refundPayment(secret, orderNumber, signal))
      },
      reload: () => {
        setShown(null)
        setGeneration((count) => count + 1)
      },
    }),
    [mine, view, run, orderNumber],
  )

  return { view, retry: payment.reload, payment }
}
