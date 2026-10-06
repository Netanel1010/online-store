import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { findSecretShapes } from './secretShapes.mjs'

// Samples are put together here, so that this file does not contain a string a scanner would report.
const atlas = (user, password, host) =>
  ['mongodb+srv://', user, ':', password, '@', host, '/db'].join('')

describe('findSecretShapes', () => {
  it('finds an Atlas connection string with a user and a password', () => {
    expect(findSecretShapes(atlas('app', 'hunter2', 'cluster0.abcde.mongodb.net'))).toEqual([
      'a MongoDB Atlas connection string with a user and a password',
    ])
    expect(findSecretShapes(`MONGODB_URI="${atlas('u', 'p', 'c.mongodb.net')}"`)).toHaveLength(1)
  })

  it('does not take a placeholder, a fake host or a local database for one', () => {
    expect(findSecretShapes('mongodb+srv://<user>:<password>@<cluster>.mongodb.net/')).toEqual([])
    expect(
      findSecretShapes(atlas('test-user', 'not-a-real-password', 'cluster.example.invalid')),
    ).toEqual([])
    expect(findSecretShapes('mongodb://localhost:27017')).toEqual([])
    expect(findSecretShapes('mongodb://user:pass@localhost:27017')).toEqual([])
    expect(findSecretShapes('mongodb+srv://cluster0.abcde.mongodb.net/')).toEqual([])
  })

  it.each([
    ['an AWS access key id', 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP'],
    ['a GitHub token', 'gh' + 'p_' + 'a'.repeat(36)],
    ['a Slack token', 'xo' + 'xb-' + '1234567890-abcdefghij'],
    ['a live Stripe key', 'sk_' + 'live_' + 'abcdefghijklmnop'],
    ['a private key', '-----BEGIN ' + 'RSA PRIVATE ' + 'KEY-----'],
  ])('finds %s', (name, sample) => {
    expect(findSecretShapes(`value = ${sample}`)).toEqual([name])
  })

  it('says what it found, never the value', () => {
    const found = findSecretShapes(atlas('app', 'hunter2', 'c.mongodb.net'))

    expect(JSON.stringify(found)).not.toContain('hunter2')
  })

  it('finds nothing in ordinary text and code', () => {
    expect(findSecretShapes('const token = readBearerToken(req.headers.authorization)')).toEqual([])
  })
})

describe('the repository', () => {
  /** Every file git tracks, as text (a binary or very large file cannot hold a pasted secret). */
  function trackedTextFiles() {
    const names = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 << 20 })
      .split('\0')
      .filter((name) => name !== '' && name !== 'package-lock.json')
    return names.flatMap((name) => {
      if (statSync(name).size > 2_000_000) return []
      const buffer = readFileSync(name)
      return buffer.includes(0) ? [] : [{ name, text: buffer.toString('utf8') }]
    })
  }

  it('has no string that looks like a real credential in any tracked file', () => {
    const files = trackedTextFiles()
    expect(files.length).toBeGreaterThan(100)

    const found = files.flatMap(({ name, text }) =>
      findSecretShapes(text).map((what) => `${name}: ${what}`),
    )

    expect(found, 'secret-shaped text in tracked files (values are not shown)').toEqual([])
  })
})
