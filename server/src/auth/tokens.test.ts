import { describe, expect, it } from 'vitest'
import { generateToken, hashToken, readBearerToken } from './tokens.ts'

describe('generateToken', () => {
  it('is 256 random bits, written so that it can travel in a header', () => {
    expect(generateToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('is different every time', () => {
    expect(new Set(Array.from({ length: 200 }, generateToken)).size).toBe(200)
  })
})

describe('hashToken', () => {
  it('is a fixed SHA-256 digest of the token, never the token itself', () => {
    const token = generateToken()

    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(token)).toBe(hashToken(token))
    expect(hashToken(token)).not.toContain(token)
    expect(hashToken(token)).not.toBe(hashToken(generateToken()))
  })
})

describe('readBearerToken', () => {
  const token = generateToken()

  it('reads the token of an Authorization header', () => {
    expect(readBearerToken(`Bearer ${token}`)).toBe(token)
    expect(readBearerToken(`bearer ${token}`)).toBe(token)
  })

  it.each([
    undefined,
    '',
    'Bearer',
    'Bearer ',
    `Basic ${'a'.repeat(43)}`,
    'Bearer two tokens',
    'Bearer short',
    `Bearer ${'a'.repeat(300)}`,
    `Bearer ${'a'.repeat(42)}!`,
    `Token ${'a'.repeat(43)}`,
  ])('is null when there is no token in %j', (header) => {
    expect(readBearerToken(header)).toBeNull()
  })
})
