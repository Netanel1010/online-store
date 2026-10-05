import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { makeProduct, readSourceCatalog } from '../testing/products.ts'
import { runTypeScript } from '../testing/runNode.ts'

const directory = mkdtempSync(join(tmpdir(), 'seed-products-'))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

const write = (name: string, content: unknown) => {
  const file = join(directory, name)
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content))
  return file
}

const seed = (file: string, env: Record<string, string> = {}) =>
  runTypeScript('src/scripts/seedProducts.ts', env, [file])

// Nothing listens on port 1: a seed that tried to write would fail with a connection error.
const unreachable = {
  MONGODB_URI: 'mongodb://shop:s3cret@127.0.0.1:1/',
  MONGODB_CONNECT_TIMEOUT_MS: '300',
}

// Each test starts a Node process, which takes a few seconds on a busy machine.
describe('the seed command', { timeout: 30_000 }, () => {
  it('stops on invalid data before it contacts the database, and says what is wrong', async () => {
    const file = write('invalid.json', [
      makeProduct({ id: 'A-1' }),
      makeProduct({ id: 'B-2', price: { current: -1 } }),
    ])

    const result = await seed(file, unreachable)

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(
      /The product data is invalid \(1 problem\)\. Nothing was written\./,
    )
    expect(result.stderr).toMatch(/1\.price\.current/)
    // It never got as far as the database.
    expect(result.stderr).not.toMatch(/MongoDB/)
    expect(result.stdout).toBe('')
  })

  it('stops on a file that is not JSON', async () => {
    const result = await seed(write('broken.json', '[{"id": '), unreachable)

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/Could not read the product data from/)
  })

  it('stops on a file that does not exist', async () => {
    const result = await seed(join(directory, 'missing.json'), unreachable)

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/Could not read the product data from/)
  })

  it('stops when no database is configured', async () => {
    const result = await seed(write('valid.json', readSourceCatalog()))

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/MONGODB_URI is not set/)
  })

  it('stops with a clear message, and without the password, when the database is unreachable', async () => {
    const result = await seed(write('valid-2.json', readSourceCatalog()), unreachable)

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/Could not connect to MongoDB/)
    expect(result.stdout).not.toMatch(/seed completed/)
    expect(result.stdout + result.stderr).not.toContain('s3cret')
  })
})
