import { describe, expect, it } from 'vitest'
import { createJsonLogger, redactSecrets, scrub } from './logger.ts'

const TIME = new Date('2026-10-06T12:00:00.000Z')

function setup() {
  const out: string[] = []
  const err: string[] = []
  const logger = createJsonLogger({
    write: (line) => out.push(line),
    writeError: (line) => err.push(line),
    now: () => TIME,
  })
  return { logger, out, err }
}

describe('createJsonLogger', () => {
  it('writes one JSON object per line, with the level, the time, the message and the fields', () => {
    const { logger, out } = setup()

    logger.info('request', { requestId: 'abc', status: 200 })

    expect(out).toHaveLength(1)
    expect(JSON.parse(out[0]!)).toEqual({
      level: 'info',
      time: '2026-10-06T12:00:00.000Z',
      msg: 'request',
      requestId: 'abc',
      status: 200,
    })
  })

  it('writes a warning to the standard output with its own level', () => {
    const { logger, out } = setup()

    logger.warn('slow', { durationMs: 900 })

    expect(JSON.parse(out[0]!)).toMatchObject({ level: 'warn', msg: 'slow', durationMs: 900 })
  })

  it('writes an error to the standard error, with what it is, what it says and where it came from', () => {
    const { logger, out, err } = setup()
    const error = new TypeError('cannot read x')

    logger.error(error, { requestId: 'abc' })

    expect(out).toEqual([])
    const entry = JSON.parse(err[0]!)
    expect(entry).toMatchObject({
      level: 'error',
      msg: 'cannot read x',
      errorName: 'TypeError',
      requestId: 'abc',
    })
    expect(entry.stack).toContain('TypeError: cannot read x')
  })

  it('names the cause of an error', () => {
    const { logger, err } = setup()

    logger.error(new Error('could not save', { cause: new RangeError('disk full') }))

    expect(JSON.parse(err[0]!).cause).toBe('RangeError: disk full')
  })

  it('logs something that is not an error as text', () => {
    const { logger, err } = setup()

    logger.error('just a string')
    logger.error({ odd: true })

    expect(JSON.parse(err[0]!).msg).toBe('just a string')
    expect(JSON.parse(err[1]!).msg).toBe('[object Object]')
  })

  it('never writes a connection string password, in a message, a stack or a field', () => {
    const { logger, out, err } = setup()
    const uri = 'mongodb+srv://shop:s3cretPass@cluster0.example.mongodb.net/db'

    logger.info(`connecting to ${uri}`, { detail: `tried ${uri}` })
    logger.error(new Error(`failed for ${uri}`, { cause: new Error(`cause ${uri}`) }))

    for (const line of [...out, ...err]) {
      expect(line).not.toContain('s3cretPass')
      expect(line).toContain('mongodb+srv://***@')
    }
  })

  it('never writes a bearer token or the value of a field named like a secret', () => {
    const { logger, out } = setup()

    logger.info('Authorization: Bearer abc123.secret-token', {
      headers: { authorization: 'Bearer abc123.secret-token', accept: 'application/json' },
      body: {
        email: 'a@b.c',
        password: 'Passw0rdOK',
        newPassword: 'x',
        token: 't',
        mongodbUri: 'u',
      },
      apiKey: 'k',
      cookie: 'c',
      security: 'kept',
    })

    const line = out[0]!
    for (const secret of ['abc123', 'Passw0rdOK', 'secret-token']) {
      expect(line).not.toContain(secret)
    }
    expect(JSON.parse(line)).toMatchObject({
      headers: { authorization: '[redacted]', accept: 'application/json' },
      body: { email: 'a@b.c', password: '[redacted]', token: '[redacted]' },
      apiKey: '[redacted]',
      cookie: '[redacted]',
      // A name that only contains the letters "uri" is not a secret.
      security: 'kept',
    })
  })
})

describe('redactSecrets', () => {
  it('hides the credentials of every connection string, whatever its case', () => {
    expect(redactSecrets('a mongodb://u:p@h/x and MONGODB+SRV://u2:p2@h2')).not.toMatch(/:p@|:p2@/)
  })

  it('hides a bearer token and keeps the rest of the text', () => {
    expect(redactSecrets('header Authorization: Bearer AbC-123_xyz, retry')).toBe(
      'header Authorization: Bearer ***, retry',
    )
  })

  it('leaves ordinary text alone', () => {
    expect(redactSecrets('GET /api/products 200')).toBe('GET /api/products 200')
  })
})

describe('scrub', () => {
  it('copies arrays and nested objects, hiding secrets at any depth', () => {
    expect(scrub({ list: [{ password: 'x', ok: 1 }], deep: { a: { token: 't' } } })).toEqual({
      list: [{ password: '[redacted]', ok: 1 }],
      deep: { a: { token: '[redacted]' } },
    })
  })

  it('stops at a limited depth, so a circular value cannot hang the log', () => {
    const circular: Record<string, unknown> = { name: 'loop' }
    circular.self = circular

    expect(() => JSON.stringify(scrub(circular))).not.toThrow()
  })

  it('turns an error into its name and a redacted message', () => {
    expect(scrub(new Error('bad mongodb://u:pw@h'))).toEqual({
      name: 'Error',
      message: 'bad mongodb://***@h',
    })
  })
})
