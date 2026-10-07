import express from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import { listen } from '../testing/listen.ts'
import type { ErrorBody } from './errorHandler.ts'
import { requestTimeout } from './requestTimeout.ts'

const open: { close: () => Promise<void> }[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((server) => server.close()))
})

async function start(timeoutMs: number) {
  const app = express()
  app.use(requestTimeout(timeoutMs))
  app.get('/fast', (_req, res) => {
    res.json({ ok: true })
  })
  app.get('/slow', async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 200))
    // The answer of a request that was already given up on: it must not break anything.
    if (!res.headersSent) res.json({ ok: true })
  })
  const server = await listen(app)
  open.push(server)
  return server
}

describe('requestTimeout', () => {
  it('leaves an answer that comes in time alone', async () => {
    const api = await start(100)

    const response = await fetch(`${api.url}/fast`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('answers 503 request_timeout, with the usual error shape and a Retry-After, when it takes too long', async () => {
    const api = await start(50)

    const response = await fetch(`${api.url}/slow`)

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      error: { code: 'request_timeout', message: 'The request took too long. Try again' },
    } satisfies ErrorBody)
  })

  it('does not stop the server from answering the next request', async () => {
    const api = await start(50)
    await fetch(`${api.url}/slow`)
    await new Promise((resolve) => setTimeout(resolve, 250))

    expect((await fetch(`${api.url}/fast`)).status).toBe(200)
  })
})
