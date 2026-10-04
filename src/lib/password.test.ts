import { generateSalt, hashPassword, verifyPassword } from './password'

describe('password hashing', () => {
  it('generates a random 32-character hex salt each time', () => {
    const a = generateSalt()
    const b = generateSalt()

    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toBe(b)
  })

  it('produces a 64-character hex hash that does not contain the password', async () => {
    const hash = await hashPassword('Secret123', generateSalt())

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('Secret123')
  })

  it('is deterministic for the same password and salt', async () => {
    const salt = generateSalt()

    expect(await hashPassword('Secret123', salt)).toBe(await hashPassword('Secret123', salt))
  })

  it('differs when the salt or the password differs', async () => {
    const base = await hashPassword('Secret123', 'aa'.repeat(16))

    expect(await hashPassword('Secret123', 'bb'.repeat(16))).not.toBe(base)
    expect(await hashPassword('Secret124', 'aa'.repeat(16))).not.toBe(base)
  })

  it('verifies a correct password and rejects a wrong one', async () => {
    const salt = generateSalt()
    const hash = await hashPassword('Secret123', salt)

    expect(await verifyPassword('Secret123', salt, hash)).toBe(true)
    expect(await verifyPassword('secret123', salt, hash)).toBe(false)
    expect(await verifyPassword('Secret123', salt, 'x'.repeat(64))).toBe(false)
    expect(await verifyPassword('Secret123', salt, '')).toBe(false)
  })
})
