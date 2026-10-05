import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('has development defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      port: 3001,
      corsOrigins: ['http://localhost:5173', 'http://localhost:4173'],
      mongodb: null,
    })
  })

  it('reads the port, the environment and a list of origins', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ORIGINS: 'https://a.example.com, https://b.example.com ,',
      MONGODB_URI: 'mongodb://localhost:27017',
    })

    expect(config).toMatchObject({
      nodeEnv: 'production',
      port: 8080,
      corsOrigins: ['https://a.example.com', 'https://b.example.com'],
    })
  })

  it.each(['abc', '0', '70000', '30.5', ''])('rejects the port "%s"', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT/)
  })

  it('rejects an unknown environment name', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/)
  })

  it.each(['localhost:5173', 'https://example.com/', 'https://example.com/shop', '*'])(
    'rejects the origin "%s"',
    (origin) => {
      expect(() => loadConfig({ CORS_ORIGINS: origin })).toThrow(/CORS_ORIGINS/)
    },
  )

  it('requires CORS_ORIGINS in production instead of using the local defaults', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://localhost:27017' }),
    ).toThrow(/CORS_ORIGINS is required/)
  })
})

describe('loadConfig: MongoDB', () => {
  const LOCAL = 'mongodb://localhost:27017'

  it('runs without a database when MONGODB_URI is not set, in development and in test', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).mongodb).toBeNull()
    expect(loadConfig({ NODE_ENV: 'test' }).mongodb).toBeNull()
  })

  it('treats an empty MONGODB_URI like an unset one', () => {
    expect(loadConfig({ MONGODB_URI: '' }).mongodb).toBeNull()
    expect(loadConfig({ MONGODB_URI: '   ' }).mongodb).toBeNull()
  })

  it('reads the connection with a default database name and timeout', () => {
    expect(loadConfig({ MONGODB_URI: LOCAL }).mongodb).toEqual({
      uri: LOCAL,
      dbName: 'online-store',
      connectTimeoutMs: 5000,
    })
  })

  it('reads the database name and the timeout', () => {
    expect(
      loadConfig({
        MONGODB_URI: ` ${LOCAL} `,
        MONGODB_DB_NAME: 'shop_dev',
        MONGODB_CONNECT_TIMEOUT_MS: '1500',
      }).mongodb,
    ).toEqual({ uri: LOCAL, dbName: 'shop_dev', connectTimeoutMs: 1500 })
  })

  it('accepts an Atlas (mongodb+srv) connection string', () => {
    const uri = 'mongodb+srv://shop:s3cret@cluster0.abcde.mongodb.net/'
    expect(loadConfig({ MONGODB_URI: uri }).mongodb?.uri).toBe(uri)
  })

  it('requires MONGODB_URI in production instead of running without a database', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://shop.example.com' }),
    ).toThrow(/MONGODB_URI is required in production/)
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://shop.example.com',
        MONGODB_URI: '',
      }),
    ).toThrow(/MONGODB_URI is required in production/)
  })

  it.each(['localhost:27017', 'postgres://user:hunter2@host/db', 'http://localhost'])(
    'rejects the connection string "%s" without repeating it',
    (uri) => {
      const error = (() => {
        try {
          loadConfig({ MONGODB_URI: uri })
        } catch (caught) {
          return caught as Error
        }
      })()

      expect(error?.message).toMatch(/MONGODB_URI/)
      expect(error?.message).not.toContain('hunter2')
      expect(error?.message).not.toContain(uri)
    },
  )

  it.each(['', 'has space', 'a.b', 'a/b', 'x'.repeat(39)])(
    'rejects the database name "%s"',
    (name) => {
      expect(() => loadConfig({ MONGODB_URI: LOCAL, MONGODB_DB_NAME: name })).toThrow(
        /MONGODB_DB_NAME/,
      )
    },
  )

  it.each(['abc', '99', '70000', '1.5'])('rejects the timeout "%s"', (value) => {
    expect(() => loadConfig({ MONGODB_URI: LOCAL, MONGODB_CONNECT_TIMEOUT_MS: value })).toThrow(
      /MONGODB_CONNECT_TIMEOUT_MS/,
    )
  })
})

describe('.env.example', () => {
  const text = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')

  it('is a valid configuration as it is, running without a database', () => {
    expect(loadConfig(parseEnv(text))).toMatchObject({
      nodeEnv: 'development',
      port: 3001,
      mongodb: null,
    })
  })

  it('has no connection string with a real password: only commented placeholders', () => {
    const lines = text.split('\n')
    expect(lines.filter((line) => line.startsWith('MONGODB_URI'))).toEqual([])
    for (const match of text.matchAll(/mongodb(?:\+srv)?:\/\/[^\s]*@/g)) {
      expect(match[0]).toMatch(/<user>:<password>@/)
    }
  })
})
