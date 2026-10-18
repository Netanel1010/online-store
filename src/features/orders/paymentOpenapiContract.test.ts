import openapi from '../../../docs/openapi.yaml?raw'
import serverPayment from '../../../server/src/orders/payment.ts?raw'
import serverSchemas from '../../../server/src/orders/schemas.ts?raw'
import {
  DEMO_PAYMENT_TIMINGS,
  initialPayment,
  toPublicPayment,
} from '../../../server/src/orders/payment'
import { ORDER_RATE_LIMITS } from '../../../server/src/orders/routes'
import {
  ATTEMPT_STATUSES,
  CANONICAL_TIMESTAMP,
  MAX_PAYMENT_ATTEMPTS,
  PAYMENT_SCENARIOS,
  PAYMENT_STATES,
} from './payment'

/**
 * docs/openapi.yaml describes the simulated payment by hand, and must say what the code does: the
 * scenarios, statuses and states, the form of a time, the fields of a payment and an attempt, the
 * errors, and the limits. It is read here as text, in the blocks of `components.schemas`, the way
 * src/features/checkout/openapiContract.test.ts reads the delivery details.
 */

/** The text of the schema `name` under `components.schemas` (keys indented four spaces). */
function schema(name: string): string {
  const start = openapi.indexOf(`\n    ${name}:\n`)
  if (start === -1) throw new Error(`docs/openapi.yaml has no schema ${name}`)
  const rest = openapi.slice(start + 1)
  const end = rest.slice(1).search(/\n {4}[A-Za-z]+:\n/)
  return end === -1 ? rest : rest.slice(0, end + 1)
}

const enumOf = (name: string) =>
  /enum: \[([^\]]*)\]/
    .exec(schema(name))![1]!
    .split(',')
    .map((value) => value.trim())

const requiredOf = (name: string) =>
  /required:\s*\[([^\]]*)\]/
    .exec(schema(name))![1]!
    .split(',')
    .map((value) => value.trim())

/** The property names of a schema: keys indented eight spaces under `properties:`. */
const propertiesOf = (name: string) => {
  const text = schema(name)
  const properties = text.slice(text.indexOf('properties:'))
  return [...properties.matchAll(/^ {8}([A-Za-z]+):/gm)].map((match) => match[1]!)
}

describe('the simulated payment in docs/openapi.yaml', () => {
  it('lists the scenarios, statuses and states of the code', () => {
    expect(enumOf('PaymentScenario')).toEqual([...PAYMENT_SCENARIOS])
    expect(enumOf('AttemptStatus')).toEqual([...ATTEMPT_STATUSES])
    expect(enumOf('PaymentState')).toEqual([...PAYMENT_STATES])
  })

  it('writes a time the way the code writes and checks it', () => {
    expect(schema('Timestamp')).toContain(`pattern: '${CANONICAL_TIMESTAMP.source}'`)
  })

  it('has exactly the fields of the payment and the attempt the API shows, and requires the ones always there', () => {
    const start = new Date('2026-10-20T10:00:00.000Z')
    const settled = {
      ...initialPayment(start, DEMO_PAYMENT_TIMINGS),
      state: 'refunded' as const,
      paidAt: new Date(start.getTime() + 3_000),
      refundedAt: new Date(start.getTime() + 9_000),
      attempts: [
        {
          number: 1,
          idempotencyKey: 'not-shown-0000000001',
          scenario: 'provider_cancel' as const,
          createdAt: start,
          settlesAt: new Date(start.getTime() + 3_000),
          timeoutAt: new Date(start.getTime() + 20_000),
          status: 'cancelled' as const,
          settledAt: new Date(start.getTime() + 3_000),
          cancelledBy: 'provider' as const,
          ignoredConfirmations: 0,
        },
      ],
    }
    const view = toPublicPayment('DEMO-7K2M9QX4', settled)!
    const fresh = toPublicPayment('DEMO-7K2M9QX4', initialPayment(start, DEMO_PAYMENT_TIMINGS))!

    expect(propertiesOf('Payment').sort()).toEqual(Object.keys(view).sort())
    expect(requiredOf('Payment').sort()).toEqual(Object.keys(fresh).sort())
    expect(propertiesOf('PaymentAttempt').sort()).toEqual(Object.keys(view.attempts[0]!).sort())
    expect(requiredOf('PaymentAttempt')).not.toContain('settledAt')
    expect(requiredOf('PaymentAttempt')).not.toContain('cancelledBy')
    expect(JSON.stringify(view)).not.toContain('not-shown')
    expect(requiredOf('Order')).toContain('payment')
  })

  it('says how many attempts an order may have', () => {
    expect(schema('PaymentAttempt')).toContain(`maximum: ${MAX_PAYMENT_ATTEMPTS}`)
    expect(schema('Payment')).toContain(`maxItems: ${MAX_PAYMENT_ATTEMPTS}`)
    expect(openapi).toContain(
      `schema: { type: integer, minimum: 1, maximum: ${MAX_PAYMENT_ATTEMPTS} }`,
    )
  })

  it('has the three payment routes', () => {
    for (const path of [
      '/api/orders/{orderNumber}/payment/attempts:',
      '/api/orders/{orderNumber}/payment/attempts/{attemptNumber}/cancel:',
      '/api/orders/{orderNumber}/payment/refund:',
    ]) {
      expect(openapi).toContain(`\n  ${path}\n`)
    }
  })

  it('names every error code the payment code can answer, and every reason it gives', () => {
    const codes = new Set(
      [
        ...`${serverPayment}\n${serverSchemas}`.matchAll(
          /code: '([a-z_]+)'|HttpError\(\s*\d{3},\s*'([a-z_]+)'/g,
        ),
      ].map((match) => match[1] ?? match[2]!),
    )
    for (const code of [
      'payment_not_open',
      'payment_attempt_active',
      'payment_attempts_exhausted',
      'idempotency_key_reuse',
      'payment_attempt_not_found',
      'payment_attempt_settled',
      'refund_not_allowed',
      'order_not_confirmed',
      'write_not_confirmed',
      'database_unavailable',
    ]) {
      expect(codes, code).toContain(code)
    }
    for (const code of codes) {
      expect(openapi, code).toContain(`\`${code}\``)
    }
    for (const reason of ['legacy', 'paid', 'refunded', 'expired', 'closing']) {
      expect(openapi).toContain(`\`${reason}\``)
    }
  })

  it('states the limit and the time an order waits as the code has them', () => {
    expect(ORDER_RATE_LIMITS.payment).toEqual({ max: 30, windowMs: 60 * 60 * 1000 })
    expect(openapi).toContain('share a limit of 30 per hour per client address')
    expect(DEMO_PAYMENT_TIMINGS.expiryMs).toBe(30 * 60 * 1000)
    expect(openapi).toContain('for 30 minutes')
    expect(schema('Payment')).toContain('(30 minutes after it was placed)')
  })
})
