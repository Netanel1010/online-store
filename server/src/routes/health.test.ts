import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { listen } from '../testing/listen.ts'

let api: Awaited<ReturnType<typeof listen>>

beforeAll(async () => {
  api = await listen(createApp({ corsOrigins: [] }))
})
afterAll(() => api.close())

describe('GET /api/health', () => {
  it('answers 200 with the status, the uptime and the time', async () => {
    const response = await fetch(`${api.url}/api/health`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)
    const body = (await response.json()) as { timestamp: string }
    expect(body).toEqual({
      status: 'ok',
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    })
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp)
  })

  it('is never cached', async () => {
    const response = await fetch(`${api.url}/api/health`)

    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('does not announce the framework', async () => {
    const response = await fetch(`${api.url}/api/health`)

    expect(response.headers.get('x-powered-by')).toBeNull()
  })
})
