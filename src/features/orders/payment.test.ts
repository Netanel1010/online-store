import {
  comparePayments,
  isWellFormedPayment,
  paymentAtMost,
  publicPaymentSchema,
  type PublicAttempt,
  type PublicPayment,
} from './payment'

/** 10:00:00.000 plus `ms`, in the canonical form. */
const t = (ms: number) => new Date(Date.parse('2026-10-20T10:00:00.000Z') + ms).toISOString()
const MIN = 60_000
const E = 30 * MIN

function attempt(overrides: Partial<PublicAttempt> & Pick<PublicAttempt, 'number'>): PublicAttempt {
  const createdAt = overrides.createdAt ?? t(0)
  const created = Date.parse(createdAt)
  return {
    scenario: 'approve',
    createdAt,
    settlesAt: new Date(created + 3_000).toISOString(),
    timeoutAt: new Date(created + 20_000).toISOString(),
    status: 'processing',
    ignoredConfirmations: 0,
    ...overrides,
  }
}

function payment(overrides: Partial<PublicPayment> = {}): PublicPayment {
  const attempts = overrides.attempts ?? []
  return {
    state: 'awaiting',
    expiresAt: t(E),
    attemptsOpenUntil: t(E - 20_000),
    attemptsLeft: 3 - attempts.length,
    pendingUpdate: false,
    attempts,
    ...overrides,
  }
}

const failed1 = attempt({
  number: 1,
  scenario: 'decline',
  status: 'failed',
  settledAt: t(3_000),
})
const processing2 = attempt({ number: 2, createdAt: t(5_000) })
const succeeded1 = attempt({ number: 1, status: 'succeeded', settledAt: t(3_000) })
const paid = payment({ state: 'paid', paidAt: t(3_000), attempts: [succeeded1] })

describe('one answer, on its own (W0 to W6)', () => {
  it('accepts the payments the server makes', () => {
    for (const valid of [
      payment(),
      payment({ attempts: [attempt({ number: 1 })] }),
      payment({ attempts: [failed1, processing2] }),
      paid,
      payment({ ...paid, state: 'refunded', refundedAt: t(4_000) }),
      payment({ state: 'expired', attempts: [failed1] }),
      payment({
        attempts: [
          attempt({ number: 1, status: 'cancelled', cancelledBy: 'visitor', settledAt: t(1_000) }),
        ],
      }),
      payment({
        attempts: [
          attempt({ number: 1, scenario: 'no_answer', status: 'timed_out', settledAt: t(20_000) }),
        ],
      }),
    ]) {
      expect(publicPaymentSchema.safeParse(valid).success).toBe(true)
      expect(isWellFormedPayment(valid), JSON.stringify(valid)).toBe(true)
    }
  })

  it.each([
    ['without milliseconds', '2026-10-20T10:00:03Z'],
    ['with an offset', '2026-10-20T12:00:03.000+02:00'],
    ['a date that does not exist', '2026-02-30T10:00:03.000Z'],
    ['a time that does not exist', '2026-10-20T25:00:03.000Z'],
  ])('refuses a time written %s (W0)', (_what, value) => {
    expect(publicPaymentSchema.safeParse(payment({ expiresAt: value })).success).toBe(false)
  })

  it.each<[string, PublicPayment]>([
    [
      'T4: attempts out of order (W1)',
      payment({
        attempts: [
          { ...processing2, number: 1 },
          { ...failed1, number: 2 },
        ],
      }),
    ],
    ['a gap in the numbers (W1)', payment({ attempts: [{ ...failed1, number: 2 }] })],
    [
      'T11: processing with a settledAt (W3)',
      payment({ attempts: [attempt({ number: 1, settledAt: t(3_000) })] }),
    ],
    [
      'T11: processing with an ignored confirmation (W3)',
      payment({ attempts: [attempt({ number: 1, ignoredConfirmations: 1 })] }),
    ],
    [
      'processing before the last attempt (W3)',
      payment({ attempts: [attempt({ number: 1 }), { ...processing2 }] }),
    ],
    [
      'T12: cancelled by the visitor at the deadline (W4)',
      payment({
        attempts: [
          attempt({ number: 1, status: 'cancelled', cancelledBy: 'visitor', settledAt: t(3_000) }),
        ],
      }),
    ],
    [
      'T13: timed out for a scenario that answers (W4)',
      payment({ attempts: [attempt({ number: 1, status: 'timed_out', settledAt: t(20_000) })] }),
    ],
    [
      'a duplicate approval that counted nothing (W4)',
      payment({
        state: 'paid',
        paidAt: t(3_000),
        attempts: [{ ...succeeded1, scenario: 'duplicate_approval' }],
      }),
    ],
    [
      'an attempt that ends after the order (W2)',
      payment({ attempts: [attempt({ number: 1, createdAt: t(E - 19_000) })] }),
    ],
    [
      'a second attempt before the first was decided (W2)',
      payment({ attempts: [failed1, attempt({ number: 2, createdAt: t(2_000) })] }),
    ],
    [
      'paid without a success (W5)',
      payment({ state: 'paid', paidAt: t(3_000), attempts: [failed1] }),
    ],
    ['a success that is not paid (W5)', payment({ attempts: [succeeded1] })],
    ['T14: paidAt not the time of the success (W6)', payment({ ...paid, paidAt: t(3_001) })],
    [
      'refunded before it was paid (W6)',
      payment({ ...paid, state: 'refunded', refundedAt: t(2_000) }),
    ],
    [
      'refundedAt on an order that is not refunded (W6)',
      payment({ ...paid, refundedAt: t(4_000) }),
    ],
    [
      'T17: attemptsLeft that does not match (W6)',
      payment({ attempts: [failed1], attemptsLeft: 3 }),
    ],
    [
      'a timeout other than the order window (W6)',
      payment({ attempts: [attempt({ number: 1, timeoutAt: t(21_000) })] }),
    ],
    [
      'two settle delays (W6)',
      payment({
        attempts: [failed1, attempt({ number: 2, createdAt: t(5_000), settlesAt: t(9_000) })],
      }),
    ],
  ])('is not consistent: %s', (_what, inconsistent) => {
    expect(isWellFormedPayment(inconsistent)).toBe(false)
    expect(comparePayments(payment(), inconsistent)).toBe('contradiction')
  })
})

describe('a newer answer against the one on screen', () => {
  it('T6: an answer that lacks the newest attempt is behind, not a contradiction', () => {
    const shown = payment({
      attemptsLeft: 1,
      attempts: [
        {
          number: 1,
          scenario: 'decline',
          createdAt: '2026-10-20T10:00:00.000Z',
          settlesAt: '2026-10-20T10:00:03.000Z',
          timeoutAt: '2026-10-20T10:00:20.000Z',
          status: 'failed',
          settledAt: '2026-10-20T10:00:03.000Z',
          ignoredConfirmations: 0,
        },
        {
          number: 2,
          scenario: 'approve',
          createdAt: '2026-10-20T10:00:05.000Z',
          settlesAt: '2026-10-20T10:00:08.000Z',
          timeoutAt: '2026-10-20T10:00:25.000Z',
          status: 'processing',
          ignoredConfirmations: 0,
        },
      ],
    })
    const next = payment({ attemptsLeft: 2, attempts: [shown.attempts[0]!] })

    expect(shown.expiresAt).toBe('2026-10-20T10:30:00.000Z')
    expect(shown.attemptsOpenUntil).toBe('2026-10-20T10:29:40.000Z')
    expect(isWellFormedPayment(shown)).toBe(true)
    expect(isWellFormedPayment(next)).toBe(true)
    expect(comparePayments(shown, next)).toBe('lag')
    // And the other way round, it is the newer answer.
    expect(comparePayments(next, shown)).toBe('forward')
  })

  it.each<[string, PublicPayment, PublicPayment, 'forward' | 'lag' | 'contradiction']>([
    [
      'T18: processing, then decided as a duplicate approval',
      payment({ attempts: [attempt({ number: 1, scenario: 'duplicate_approval' })] }),
      payment({
        state: 'paid',
        paidAt: t(3_000),
        attempts: [{ ...succeeded1, scenario: 'duplicate_approval', ignoredConfirmations: 1 }],
      }),
      'forward',
    ],
    [
      'T19: paid, then refunded',
      paid,
      payment({ ...paid, state: 'refunded', refundedAt: t(9_000) }),
      'forward',
    ],
    ['T20: the same answer twice', paid, paid, 'forward'],
    [
      'refunded, then paid (a lagging copy)',
      payment({ ...paid, state: 'refunded', refundedAt: t(9_000) }),
      paid,
      'lag',
    ],
    [
      'a pending update is advice, not a fact',
      paid,
      payment({ ...paid, pendingUpdate: true }),
      'forward',
    ],
    [
      'expired, then paid',
      payment({ state: 'expired', attempts: [failed1] }),
      payment({
        state: 'paid',
        paidAt: t(8_000),
        attempts: [
          failed1,
          attempt({ number: 2, createdAt: t(5_000), status: 'succeeded', settledAt: t(8_000) }),
        ],
      }),
      'contradiction',
    ],
    [
      'T1: a processing attempt whose settlesAt moved',
      payment({ attempts: [attempt({ number: 1 })] }),
      payment({ attempts: [attempt({ number: 1, settlesAt: t(4_000) })] }),
      'contradiction',
    ],
    [
      'T2: a decided attempt whose times all moved together',
      paid,
      payment({
        state: 'paid',
        paidAt: t(4_000),
        attempts: [
          attempt({ number: 1, createdAt: t(1_000), status: 'succeeded', settledAt: t(4_000) }),
        ],
      }),
      'contradiction',
    ],
    [
      'T3: another createdAt',
      payment({ attempts: [attempt({ number: 1 })] }),
      payment({ attempts: [attempt({ number: 1, createdAt: t(1) })] }),
      'contradiction',
    ],
    [
      'T5 (corrected in implementation: an older prefix, so lag): the first attempt still processing, the second missing',
      payment({ attempts: [failed1, processing2] }),
      payment({ attempts: [{ ...failed1, status: 'processing', settledAt: undefined }] }),
      'lag',
    ],
    [
      'T7: cancelled by the visitor, then by the provider',
      payment({
        attempts: [
          attempt({
            number: 1,
            scenario: 'provider_cancel',
            status: 'cancelled',
            cancelledBy: 'visitor',
            settledAt: t(1_000),
          }),
        ],
      }),
      payment({
        attempts: [
          attempt({
            number: 1,
            scenario: 'provider_cancel',
            status: 'cancelled',
            cancelledBy: 'provider',
            settledAt: t(3_000),
          }),
        ],
      }),
      'contradiction',
    ],
    [
      'T8: cancelled at another time',
      payment({
        attempts: [
          attempt({ number: 1, status: 'cancelled', cancelledBy: 'visitor', settledAt: t(1_000) }),
        ],
      }),
      payment({
        attempts: [
          attempt({ number: 1, status: 'cancelled', cancelledBy: 'visitor', settledAt: t(1_001) }),
        ],
      }),
      'contradiction',
    ],
    [
      'T9: succeeded, then failed',
      paid,
      payment({ attempts: [{ ...succeeded1, status: 'failed' }] }),
      'contradiction',
    ],
    [
      'T10: an ignored confirmation forgotten',
      payment({
        state: 'paid',
        paidAt: t(3_000),
        attempts: [{ ...succeeded1, scenario: 'duplicate_approval', ignoredConfirmations: 1 }],
      }),
      payment({
        state: 'paid',
        paidAt: t(3_000),
        attempts: [{ ...succeeded1, scenario: 'approve' }],
      }),
      'contradiction',
    ],
    [
      'T15: another refund time',
      payment({ ...paid, state: 'refunded', refundedAt: t(9_000) }),
      payment({ ...paid, state: 'refunded', refundedAt: t(9_001) }),
      'contradiction',
    ],
    [
      'T16: another expiresAt',
      paid,
      payment({ ...paid, expiresAt: t(E + 1), attemptsOpenUntil: t(E + 1 - 20_000) }),
      'contradiction',
    ],
    [
      'another scenario for the same attempt',
      payment({ attempts: [attempt({ number: 1 })] }),
      payment({ attempts: [attempt({ number: 1, scenario: 'decline' })] }),
      'contradiction',
    ],
  ])('%s', (_what, shown, next, expected) => {
    expect(isWellFormedPayment(shown), 'the shown payment is consistent').toBe(true)
    expect(comparePayments(shown, next)).toBe(expected)
  })

  it('compares times by the instant, not by how they are written', () => {
    // Only the canonical form reaches the comparison (W0), and two equal instants are equal.
    expect(paymentAtMost(paid, structuredClone(paid))).toBe(true)
  })
})
