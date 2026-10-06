import { describe, expect, it } from 'vitest'
import { createLoginThrottle } from './throttle.ts'

function setup(options: Parameters<typeof createLoginThrottle>[0] = {}) {
  let now = 1_000_000
  const throttle = createLoginThrottle({ now: () => now, ...options })
  return { throttle, advance: (ms: number) => (now += ms) }
}

const MINUTE = 60_000

describe('createLoginThrottle', () => {
  it('lets a key try until it has failed five times', () => {
    const { throttle } = setup()

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(throttle.retryAfter('a@b.co')).toBe(0)
      throttle.failed('a@b.co')
    }
    expect(throttle.retryAfter('a@b.co')).toBe(0)

    throttle.failed('a@b.co')
    expect(throttle.retryAfter('a@b.co')).toBeGreaterThan(0)
  })

  it('says how many seconds are left, rounded up, and counts them down', () => {
    const { throttle, advance } = setup()
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.failed('a@b.co')

    expect(throttle.retryAfter('a@b.co')).toBe(15 * 60)
    advance(MINUTE + 1)
    expect(throttle.retryAfter('a@b.co')).toBe(14 * 60)
  })

  it('lets the key try again once the time is over, with a clean count', () => {
    const { throttle, advance } = setup()
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.failed('a@b.co')

    advance(15 * MINUTE)

    expect(throttle.retryAfter('a@b.co')).toBe(0)
    for (let attempt = 0; attempt < 4; attempt += 1) throttle.failed('a@b.co')
    expect(throttle.retryAfter('a@b.co')).toBe(0)
  })

  it('does not count failures that are further apart than the window', () => {
    const { throttle, advance } = setup()

    for (let attempt = 0; attempt < 4; attempt += 1) throttle.failed('a@b.co')
    advance(15 * MINUTE + 1)
    throttle.failed('a@b.co')

    expect(throttle.retryAfter('a@b.co')).toBe(0)
  })

  it('forgets the failures of a key that signs in', () => {
    const { throttle } = setup()
    for (let attempt = 0; attempt < 4; attempt += 1) throttle.failed('a@b.co')

    throttle.succeeded('a@b.co')
    for (let attempt = 0; attempt < 4; attempt += 1) throttle.failed('a@b.co')

    expect(throttle.retryAfter('a@b.co')).toBe(0)
  })

  it('keeps the keys apart', () => {
    const { throttle } = setup()
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.failed('a@b.co')

    expect(throttle.retryAfter('a@b.co')).toBeGreaterThan(0)
    expect(throttle.retryAfter('other@b.co')).toBe(0)
  })

  it('does not extend the block for more failures while it lasts', () => {
    const { throttle, advance } = setup()
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.failed('a@b.co')
    advance(10 * MINUTE)

    throttle.failed('a@b.co')

    expect(throttle.retryAfter('a@b.co')).toBe(5 * 60)
  })

  it('has a limit on the number of keys it remembers, dropping the oldest', () => {
    const { throttle } = setup({ maxKeys: 3 })

    for (const key of ['a', 'b', 'c', 'd']) {
      for (let attempt = 0; attempt < 5; attempt += 1) throttle.failed(key)
    }

    expect(throttle.retryAfter('a')).toBe(0)
    expect(throttle.retryAfter('d')).toBeGreaterThan(0)
  })

  it('removes the keys whose time is over before dropping any that still count', () => {
    const { throttle, advance } = setup({ maxKeys: 2 })
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.failed('old')
    advance(16 * MINUTE)
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.failed('b')
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.failed('c')

    expect(throttle.retryAfter('b')).toBeGreaterThan(0)
    expect(throttle.retryAfter('c')).toBeGreaterThan(0)
  })
})
