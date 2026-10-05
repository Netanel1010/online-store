import { describe, expect, it } from 'vitest'
import { runTypeScript } from './testing/runNode.ts'

const startServer = (env: Record<string, string>) => runTypeScript('src/server.ts', env)

// Each test starts a Node process, which takes a few seconds on a busy machine.
describe('starting the server', { timeout: 30_000 }, () => {
  it('stops with exit code 1 and a clear message when the database cannot be reached', async () => {
    const result = await startServer({
      MONGODB_URI: 'mongodb://shop:s3cret@127.0.0.1:1/',
      MONGODB_CONNECT_TIMEOUT_MS: '300',
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/Could not connect to MongoDB/)
    expect(result.stdout).not.toMatch(/listening/)
    expect(result.stdout + result.stderr).not.toContain('s3cret')
  })

  it('stops with exit code 1 in production without a database configured', async () => {
    const result = await startServer({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://shop.example.com',
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/MONGODB_URI is required in production/)
  })

  it('stops with exit code 1 on a connection string that is not MongoDB, without printing it', async () => {
    const result = await startServer({ MONGODB_URI: 'postgres://shop:s3cret@db.example.com/shop' })

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/MONGODB_URI/)
    expect(result.stdout + result.stderr).not.toContain('s3cret')
  })
})
