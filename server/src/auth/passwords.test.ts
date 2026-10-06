import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './passwords.ts'

describe('hashPassword', () => {
  it('never contains the password', async () => {
    const hash = await hashPassword('Passw0rdOK')

    expect(hash).not.toContain('Passw0rdOK')
    expect(hash).not.toContain(Buffer.from('Passw0rdOK').toString('base64'))
  })

  it('writes the algorithm and its parameters into the hash, so they can be raised later', async () => {
    const hash = await hashPassword('Passw0rdOK')

    expect(hash).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/)
  })

  it('gives the same password a different hash each time (a random salt)', async () => {
    const [a, b] = await Promise.all([hashPassword('Passw0rdOK'), hashPassword('Passw0rdOK')])

    expect(a).not.toBe(b)
  })

  it('accepts any text, Hebrew and emoji included', async () => {
    const hash = await hashPassword('סיסמה-123-🔒')

    expect(await verifyPassword('סיסמה-123-🔒', hash)).toBe(true)
  })
})

describe('verifyPassword', () => {
  it('accepts the right password and rejects any other', async () => {
    const hash = await hashPassword('Passw0rdOK')

    expect(await verifyPassword('Passw0rdOK', hash)).toBe(true)
    expect(await verifyPassword('Passw0rdOk', hash)).toBe(false)
    expect(await verifyPassword('Passw0rdOK ', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it.each([
    '',
    'plaintext',
    'scrypt$32768$8$3$salt',
    'scrypt$32768$8$3$$',
    'bcrypt$32768$8$3$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
    'scrypt$x$8$3$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
    // Parameters far above anything this API writes would let a bad record cost a lot of memory.
    'scrypt$1073741824$8$3$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
  ])('is false for a stored value that is not one of its hashes (%j)', async (stored) => {
    expect(await verifyPassword('Passw0rdOK', stored)).toBe(false)
  })

  it('takes about as long for no account as for a wrong password', async () => {
    const hash = await hashPassword('Passw0rdOK')
    const time = async (run: () => Promise<unknown>) => {
      const start = performance.now()
      await run()
      return performance.now() - start
    }

    const wrong = await time(() => verifyPassword('wrong-password-1', hash))
    const none = await time(() => verifyPassword('wrong-password-1', null))

    // Both do the whole derivation: neither answers early.
    expect(none).toBeGreaterThan(wrong / 4)
    expect(await verifyPassword('wrong-password-1', null)).toBe(false)
  })
})
