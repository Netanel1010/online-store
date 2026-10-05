import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import type { ErrorBody } from './errorHandler.ts'
import { listen } from '../testing/listen.ts'

let api: Awaited<ReturnType<typeof listen>>

beforeAll(async () => {
  api = await listen(createApp({ corsOrigins: [] }))
})
afterAll(() => api.close())

describe('unknown routes', () => {
  it('answers an unknown API route with a JSON 404', async () => {
    const response = await fetch(`${api.url}/api/nothing-here`)

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: 'Route not found: GET /api/nothing-here' },
    })
  })

  it('answers a route outside /api the same way, not with an HTML page', async () => {
    const response = await fetch(`${api.url}/products`)

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)
  })

  it('answers a method the route does not have with a 404', async () => {
    const response = await fetch(`${api.url}/api/health`, { method: 'POST' })

    expect(response.status).toBe(404)
    expect(((await response.json()) as ErrorBody).error.code).toBe('not_found')
  })
})
