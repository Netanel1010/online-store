import { EventEmitter } from 'node:events'
import express, { type Request, type Response } from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.ts'
import type { Database } from '../db/database.ts'
import { createJsonLogger } from '../lib/logger.ts'
import { listen } from '../testing/listen.ts'
import { requestLogging } from './requestLogging.ts'

const lines: string[] = []
const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>)
const logger = createJsonLogger({
  write: (line) => lines.push(line),
  writeError: (line) => lines.push(line),
})

/** A database whose every read fails with an error that repeats the connection string, as a driver can. */
function databaseThatFails(): Database {
  const failure = new Error(
    'connection to mongodb://shop:s3cretPass@db.example.com:27017 timed out',
  )
  const cursor = {
    sort: () => cursor,
    skip: () => cursor,
    limit: () => cursor,
    toArray: () => Promise.reject(failure),
  }
  const collection = {
    find: () => cursor,
    findOne: () => Promise.reject(failure),
    countDocuments: () => Promise.resolve(0),
  }
  return { db: () => ({ collection: () => collection }) } as unknown as Database
}

let api: Awaited<ReturnType<typeof listen>>
let failingApi: Awaited<ReturnType<typeof listen>>
let routes: Awaited<ReturnType<typeof listen>>

beforeAll(async () => {
  api = await listen(
    createApp({ corsOrigins: ['https://shop.example.com'], trustProxyHops: 1 }, logger),
  )
  failingApi = await listen(createApp({ corsOrigins: [] }, logger, databaseThatFails()))

  // Routes that answer what the levels are about: a success, a client error and a server error.
  const small = express()
  small.use(requestLogging(logger))
  small.get('/ok', (_req, res) => void res.json({ ok: true }))
  small.get('/missing', (_req, res) => void res.status(404).json({}))
  small.get('/broken', (_req, res) => void res.status(500).json({}))
  routes = await listen(small)
})
afterAll(async () => {
  await api.close()
  await failingApi.close()
  await routes.close()
})
beforeEach(() => {
  lines.length = 0
})

const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${api.url}${path}`, { headers })

/** The log line that says a request is over (not an error line, which has the same id). */
async function requestEntry(id: string) {
  const find = () => entries().find((entry) => entry.requestId === id && entry.msg === 'request')
  await expect.poll(find).toBeDefined()
  return find()!
}

describe('request ids', () => {
  it('gives every answer an X-Request-Id, including a 404, an error and a preflight', async () => {
    const answers = [
      await get('/api/nothing-here'),
      await fetch(`${failingApi.url}/api/products`),
      await fetch(`${api.url}/api/auth/login`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://shop.example.com', 'Access-Control-Request-Method': 'POST' },
      }),
    ]

    for (const answer of answers) {
      expect(answer.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    }
    const ids = answers.map((answer) => answer.headers.get('x-request-id'))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the id a caller sends, so a request can be followed from the site to the API', async () => {
    const response = await get('/api/nothing-here', { 'X-Request-Id': 'site-7f3a9c1e-0042' })

    expect(response.headers.get('x-request-id')).toBe('site-7f3a9c1e-0042')
    expect((await requestEntry('site-7f3a9c1e-0042')).path).toBe('/api/nothing-here')
  })

  it.each([
    ['too short', 'abc'],
    ['too long', 'a'.repeat(65)],
    ['with a space', 'has a space in it'],
    ['with a quote', 'ab"cd-efgh-1234'],
    ['with a brace', 'abcd-efgh-{"level":"error"}'],
  ])('replaces an id that is %s, so it cannot break or forge a log line', async (_name, sent) => {
    const response = await get('/api/nothing-here', { 'X-Request-Id': sent })

    const id = response.headers.get('x-request-id')!
    expect(id).not.toBe(sent)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('is in the body of a server error, and the log line of that error has the same id', async () => {
    const response = await fetch(`${failingApi.url}/api/products`)
    const body = (await response.json()) as { error: { code: string; requestId: string } }

    expect(response.status).toBe(500)
    expect(body.error.requestId).toBe(response.headers.get('x-request-id'))
    const errorLine = entries().find((entry) => entry.level === 'error')!
    expect(errorLine.requestId).toBe(body.error.requestId)
    expect((await requestEntry(body.error.requestId)).status).toBe(500)
  })

  it('is not in the body of an error the client caused: a 404 needs no lookup', async () => {
    const response = await get('/api/nothing-here')

    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: object }).error).not.toHaveProperty('requestId')
  })
})

describe('request log lines', () => {
  it('say what happened and how long it took, and nothing else', async () => {
    const response = await get('/api/nothing-here')

    const entry = await requestEntry(response.headers.get('x-request-id')!)

    expect(Object.keys(entry).sort()).toEqual(
      ['durationMs', 'ip', 'level', 'method', 'msg', 'path', 'requestId', 'status', 'time'].sort(),
    )
    expect(entry).toMatchObject({
      msg: 'request',
      method: 'GET',
      path: '/api/nothing-here',
      status: 404,
    })
    expect(entry.durationMs).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(Date.parse(String(entry.time)))).toBe(false)
  })

  it('log a success as info, a client error as a warning, and a server error as a warning that says so', async () => {
    const ok = await fetch(`${routes.url}/ok`)
    const missing = await fetch(`${routes.url}/missing`)
    const broken = await fetch(`${routes.url}/broken`)

    expect(await requestEntry(ok.headers.get('x-request-id')!)).toMatchObject({
      level: 'info',
      status: 200,
    })
    expect(await requestEntry(missing.headers.get('x-request-id')!)).toMatchObject({
      level: 'warn',
      status: 404,
    })
    const brokenEntry = await requestEntry(broken.headers.get('x-request-id')!)
    expect(brokenEntry).toMatchObject({ level: 'warn', status: 500, outcome: 'server error' })
  })

  it('never contain the query string: it is what a visitor typed', async () => {
    const response = await get('/api/products?q=my%20secret%20search&category=cpu')

    const entry = await requestEntry(response.headers.get('x-request-id')!)

    expect(entry.path).toBe('/api/products')
    expect(lines.join('\n')).not.toContain('secret%20search')
    expect(lines.join('\n')).not.toContain('my secret search')
  })

  it('do not contain a password, a token or a header, whatever the request carried', async () => {
    const login = await fetch(`${api.url}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer SECRET-BEARER-TOKEN-12345678901234567890123',
        Cookie: 'session=SECRET-COOKIE',
      },
      body: JSON.stringify({ email: 'a@example.com', password: 'Sup3rSecretPassw0rd' }),
    })
    const me = await get('/api/auth/me', {
      Authorization: 'Bearer ANOTHER-SECRET-BEARER-TOKEN-0123456789012',
    })
    await requestEntry(login.headers.get('x-request-id')!)
    await requestEntry(me.headers.get('x-request-id')!)

    const everything = lines.join('\n')
    for (const secret of [
      'Sup3rSecretPassw0rd',
      'SECRET-BEARER-TOKEN',
      'SECRET-COOKIE',
      'ANOTHER-SECRET',
      'Bearer',
    ]) {
      expect(everything).not.toContain(secret)
    }
  })

  it('never contain the password of a connection string that an error repeats', async () => {
    const response = await fetch(`${failingApi.url}/api/products`)
    await requestEntry(response.headers.get('x-request-id')!)

    const everything = lines.join('\n')
    expect(everything).not.toContain('s3cretPass')
    expect(everything).toContain('mongodb://***@db.example.com')
  })

  it('log the address of the client, as the trusted proxy saw it', async () => {
    const response = await get('/api/nothing-here', { 'X-Forwarded-For': '198.51.100.23' })

    expect((await requestEntry(response.headers.get('x-request-id')!)).ip).toBe('198.51.100.23')
  })

  it('do not fill the log with successful health checks', async () => {
    await get('/api/health')
    await get('/api/health/ready')
    const marker = await get('/api/nothing-here')
    await requestEntry(marker.headers.get('x-request-id')!)

    expect(entries().filter((entry) => String(entry.path).startsWith('/api/health'))).toEqual([])
  })

  it('are written once per request, even though the response both finishes and closes', async () => {
    const response = await get('/api/nothing-here')
    const id = response.headers.get('x-request-id')!
    await requestEntry(id)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(
      entries().filter((entry) => entry.requestId === id && entry.msg === 'request'),
    ).toHaveLength(1)
  })
})

describe('a request the client gave up on', () => {
  /** A request and a response that are only as real as the middleware needs. */
  function fake(path: string) {
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      writableFinished: false,
      locals: {} as Record<string, unknown>,
      set: vi.fn(),
    })
    const req = {
      get: () => undefined,
      originalUrl: path,
      method: 'GET',
      ip: '203.0.113.9',
    } as unknown as Request
    return { req, res: res as unknown as Response, emitter: res }
  }

  it('is logged as aborted when the connection closes before the answer was complete', () => {
    const calls: [string, Record<string, unknown>][] = []
    const handler = requestLogging({ error: () => {}, warn: (m, f) => void calls.push([m, f!]) })
    const { req, res, emitter } = fake('/api/products?q=x')

    handler(req, res, () => {})
    emitter.emit('close')

    expect(calls).toHaveLength(1)
    expect(calls[0]![1]).toMatchObject({ aborted: true, path: '/api/products', method: 'GET' })
  })

  it('is not logged as aborted when the answer was complete', () => {
    const calls: [string, Record<string, unknown>][] = []
    const handler = requestLogging({ error: () => {}, info: (m, f) => void calls.push([m, f!]) })
    const { req, res, emitter } = fake('/api/products')

    handler(req, res, () => {})
    emitter.writableFinished = true
    emitter.emit('finish')
    emitter.emit('close')

    expect(calls).toHaveLength(1)
    expect(calls[0]![1]).not.toHaveProperty('aborted')
  })
})
