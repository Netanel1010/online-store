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

describe('the hashing is what it was, so that an account made before the rules for a new password changed can sign in', () => {
  // Hashes that were made by `hashPassword` before those rules changed, which did not touch the hashing.
  // If the hashing is ever changed, these must still be verified (a new format gets a new prefix).
  const MADE_BEFORE = [
    [
      'Passw0rdOK',
      'scrypt$32768$8$3$ErjudAfNC37Thk_7zd_P9Q$th8IrwgX9JKGyCoGPP9U8zG9yjpBaGQjpQogifW2F6fagMPbZf3B2ezbPxaTk131fCR58thhWC1DYzDmFX0-jQ',
    ],
    [
      'סיסמה ארוכה 🔒',
      'scrypt$32768$8$3$PiEYDsYG_QQXbEr_L88Rzw$c6FdseBOk1czAKNRW2gHwQTUPp4UKU6ERyJgnk6HHbdIlgLPOEGZeirYTh3vaY_Zg5kNTHuxL2xoPyae3eC_zQ',
    ],
  ] as const

  it.each(MADE_BEFORE)('verifies the hash of %s that was made before', async (password, stored) => {
    expect(await verifyPassword(password, stored)).toBe(true)
    expect(await verifyPassword(`${password} `, stored)).toBe(false)
  })

  it('hashes a password as NFKC: a fullwidth copy of it is the same password', async () => {
    const hash = await hashPassword('password1')
    const fullwidth = [...'password1']
      .map((c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0))
      .join('')

    expect(await verifyPassword(fullwidth, hash)).toBe(true)
  })

  it('does not lower-case or trim a password: a capital and a space make it another one', async () => {
    const hash = await hashPassword('password1')

    expect(await verifyPassword('Password1', hash)).toBe(false)
    expect(await verifyPassword(' password1', hash)).toBe(false)
    expect(await verifyPassword('password1 ', hash)).toBe(false)
  })

  it('hashes a lone surrogate as U+FFFD, so that different texts are one password (why a new password may not have one)', async () => {
    const lone = `abcdefg${String.fromCharCode(0xd800)}`
    const other = `abcdefg${String.fromCharCode(0xdc00)}`
    const replacement = `abcdefg${String.fromCharCode(0xfffd)}`
    const hash = await hashPassword(lone)

    expect(await verifyPassword(other, hash)).toBe(true)
    expect(await verifyPassword(replacement, hash)).toBe(true)
    expect(await verifyPassword('abcdefg', hash)).toBe(false)
  })
})
