import { sessionEndedBefore } from './routing'
import { clearSessionEnded, markSessionEnded, sessionJustEnded } from './sessionEnded'

const NOW = 1_800_000_000_000

describe('the session that ended just now', () => {
  it('is not there until a page says so', () => {
    expect(sessionJustEnded(NOW)).toBe(false)
  })

  it('is there for ten seconds, to the millisecond, and then it is gone by itself', () => {
    markSessionEnded(NOW)

    expect(sessionJustEnded(NOW)).toBe(true)
    expect(sessionJustEnded(NOW + 9_999)).toBe(true)
    expect(sessionJustEnded(NOW + 10_000)).toBe(false)
  })

  it('is not there when the clock went back since it was said', () => {
    markSessionEnded(NOW)

    expect(sessionJustEnded(NOW - 1)).toBe(false)
  })

  it('is gone once it is cleared', () => {
    markSessionEnded(NOW)

    clearSessionEnded()

    expect(sessionJustEnded(NOW)).toBe(false)
  })
})

describe('the reason in the state of the redirect', () => {
  it('is read only when it is exactly the one reason there is', () => {
    expect(sessionEndedBefore({ from: '/checkout', reason: 'session-ended' })).toBe(true)
    expect(sessionEndedBefore({ from: '/checkout' })).toBe(false)
    expect(sessionEndedBefore({ reason: 'anything else' })).toBe(false)
    expect(sessionEndedBefore({ reason: true })).toBe(false)
    expect(sessionEndedBefore(null)).toBe(false)
    expect(sessionEndedBefore(undefined)).toBe(false)
    expect(sessionEndedBefore('session-ended')).toBe(false)
  })
})
