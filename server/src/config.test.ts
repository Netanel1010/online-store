import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('has development defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      port: 3001,
      corsOrigins: ['http://localhost:5173', 'http://localhost:4173'],
    })
  })

  it('reads the port, the environment and a list of origins', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ORIGINS: 'https://a.example.com, https://b.example.com ,',
    })

    expect(config).toEqual({
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
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS is required/)
  })
})
