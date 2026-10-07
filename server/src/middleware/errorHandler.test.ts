import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.ts'
import { HttpError } from '../lib/httpError.ts'
import { listen } from '../testing/listen.ts'
import { errorHandler, type ErrorBody } from './errorHandler.ts'

const logger = { error: vi.fn() }

// A small app whose routes fail in the ways a real route can.
const failing = express()
failing.get('/teapot', () => {
  throw new HttpError(418, 'teapot', 'I am a teapot')
})
failing.get('/with-headers', () => {
  throw new HttpError(401, 'unauthorized', 'No', {
    'WWW-Authenticate': 'Bearer',
    'Retry-After': '9',
  })
})
failing.get('/with-details', () => {
  throw new HttpError(409, 'conflict', 'No', {}, { productIds: ['A', 'B'], total: 5 })
})
failing.get('/bug', () => {
  throw new Error('database password is hunter2')
})
failing.get('/async-bug', async () => {
  throw new Error('rejected promise')
})
failing.use(errorHandler(logger))

let failingApi: Awaited<ReturnType<typeof listen>>
let api: Awaited<ReturnType<typeof listen>>

beforeAll(async () => {
  failingApi = await listen(failing)
  api = await listen(createApp({ corsOrigins: [] }, logger))
})
afterAll(async () => {
  await failingApi.close()
  await api.close()
})

describe('errorHandler', () => {
  it('sends the headers an HttpError carries', async () => {
    const response = await fetch(`${failingApi.url}/with-headers`)

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(response.headers.get('retry-after')).toBe('9')
  })

  it('answers an HttpError with its own status, code and message', async () => {
    const response = await fetch(`${failingApi.url}/teapot`)

    expect(response.status).toBe(418)
    expect(await response.json()).toEqual({ error: { code: 'teapot', message: 'I am a teapot' } })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('sends the details an HttpError carries, and no details key when it has none', async () => {
    const response = await fetch(`${failingApi.url}/with-details`)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: { code: 'conflict', message: 'No', details: { productIds: ['A', 'B'], total: 5 } },
    })
    const plain = (await (await fetch(`${failingApi.url}/teapot`)).json()) as ErrorBody
    expect(plain.error).not.toHaveProperty('details')
  })

  it('answers any other error with a generic 500 and logs the real one', async () => {
    logger.error.mockClear()

    const response = await fetch(`${failingApi.url}/bug`)

    expect(response.status).toBe(500)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      error: { code: 'internal_error', message: 'Internal server error' },
    })
    expect(text).not.toContain('hunter2')
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })

  it('handles a rejected promise in an async route', async () => {
    logger.error.mockClear()

    const response = await fetch(`${failingApi.url}/async-bug`)

    expect(response.status).toBe(500)
    expect(((await response.json()) as ErrorBody).error.code).toBe('internal_error')
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})

describe('request bodies', () => {
  const post = (body: string) =>
    fetch(`${api.url}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

  it('answers invalid JSON with a 400', async () => {
    logger.error.mockClear()

    const response = await post('{"broken":')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { code: 'invalid_json', message: 'The request body is not valid JSON' },
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('answers a body over the limit with a 413', async () => {
    const response = await post(JSON.stringify({ text: 'x'.repeat(200_000) }))

    expect(response.status).toBe(413)
    expect(((await response.json()) as ErrorBody).error.code).toBe('payload_too_large')
  })

  it('parses a valid JSON body without an error', async () => {
    const response = await post('{"ok":true}')

    // The body is accepted; there is simply no POST route here.
    expect(response.status).toBe(404)
  })
})
