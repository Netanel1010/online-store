import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.ts'
import type { Database } from '../db/database.ts'
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

// A stand-in for the database: only what the health checks use.
const databaseAnswering = (up: boolean): Database & { ping: ReturnType<typeof vi.fn> } => ({
  connect: vi.fn(),
  close: vi.fn(),
  db: vi.fn(),
  ping: vi.fn().mockResolvedValue(up),
})

describe('GET /api/health/ready', () => {
  const servers: Awaited<ReturnType<typeof listen>>[] = []
  const serve = async (database: Database | null) => {
    const started = await listen(createApp({ corsOrigins: [] }, undefined, database))
    servers.push(started)
    return started
  }
  afterAll(() => Promise.all(servers.map((server) => server.close())))

  it('says the database is not configured, without failing, when the API runs without one', async () => {
    const { url } = await serve(null)

    const response = await fetch(`${url}/api/health/ready`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', database: 'not_configured' })
  })

  it('answers 200 when the database answers', async () => {
    const database = databaseAnswering(true)
    const { url } = await serve(database)

    const response = await fetch(`${url}/api/health/ready`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', database: 'up' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(database.ping).toHaveBeenCalledTimes(1)
  })

  it('answers 503 when the database does not answer, and says nothing else about it', async () => {
    const { url } = await serve(databaseAnswering(false))

    const response = await fetch(`${url}/api/health/ready`)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'unavailable', database: 'down' })
  })

  it('leaves /api/health alone: the process is healthy even when the database is down', async () => {
    const database = databaseAnswering(false)
    const { url } = await serve(database)

    const response = await fetch(`${url}/api/health`)

    expect(response.status).toBe(200)
    expect(((await response.json()) as { status: string }).status).toBe('ok')
    expect(database.ping).not.toHaveBeenCalled()
  })
})
