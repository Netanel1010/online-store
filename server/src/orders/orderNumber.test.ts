import { describe, expect, it, vi } from 'vitest'
import { generateOrderNumber, ORDER_NUMBER_PATTERN } from './orderNumber.ts'

describe('generateOrderNumber', () => {
  it('looks like DEMO- and eight letters and digits that cannot be confused', () => {
    for (let index = 0; index < 200; index += 1) {
      const number = generateOrderNumber()
      expect(number).toMatch(ORDER_NUMBER_PATTERN)
      expect(number).toMatch(/^DEMO-[0-9A-Z]{8}$/)
      expect(number.slice(5)).not.toMatch(/[ILOU]/)
    }
  })

  it('asks for a whole number below 32 for every character, so none is favoured', () => {
    const draw = vi.fn<(max: number) => number>(() => 0)

    generateOrderNumber(draw)

    expect(draw).toHaveBeenCalledTimes(8)
    for (const [max] of draw.mock.calls) expect(max).toBe(32)
  })

  it('uses every one of the 32 characters exactly once across the whole range', () => {
    const seen = new Set<string>()
    for (let value = 0; value < 32; value += 1) {
      seen.add(generateOrderNumber(() => value).slice(5, 6))
    }

    expect(seen.size).toBe(32)
  })

  it('does not repeat itself in a thousand draws', () => {
    const numbers = new Set(Array.from({ length: 1000 }, () => generateOrderNumber()))

    expect(numbers.size).toBe(1000)
  })
})

describe('ORDER_NUMBER_PATTERN', () => {
  it.each(['DEMO-7K2M9QX4', 'DEMO-00000000', 'DEMO-ZZZZZZZZ'])('accepts %s', (value) => {
    expect(value).toMatch(ORDER_NUMBER_PATTERN)
  })

  it.each([
    'DEMO-7K2M9QX',
    'DEMO-7K2M9QX45',
    'demo-7k2m9qx4',
    'DEMO-7K2M9QXI',
    'DEMO-7K2M9QXO',
    'ORD-7K2M9QX4',
    'DEMO-123456',
    '',
    'DEMO-7K2M9QX4\n',
  ])('refuses %j', (value) => {
    expect(value).not.toMatch(ORDER_NUMBER_PATTERN)
  })
})
