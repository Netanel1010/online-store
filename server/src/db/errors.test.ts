import { describe, expect, it } from 'vitest'
import { DatabaseConnectionError, redactUri } from './errors.ts'

describe('redactUri', () => {
  it('hides the user and the password of a connection string', () => {
    expect(redactUri('failed for mongodb://shop:s3cret@db.example.com:27017/shop')).toBe(
      'failed for mongodb://***@db.example.com:27017/shop',
    )
  })

  it('handles the Atlas form and every string in a text', () => {
    expect(redactUri('a mongodb+srv://u:p@cluster0.mongodb.net/ and b MONGODB://x:y@host')).toBe(
      'a mongodb+srv://***@cluster0.mongodb.net/ and b MONGODB://***@host',
    )
  })

  it('leaves a string without credentials as it is', () => {
    expect(redactUri('connect ECONNREFUSED mongodb://localhost:27017')).toBe(
      'connect ECONNREFUSED mongodb://localhost:27017',
    )
  })
})

describe('DatabaseConnectionError', () => {
  it('says what failed and why, without credentials', () => {
    const reason = new Error('bad auth for mongodb://shop:s3cret@db.example.com')

    const error = new DatabaseConnectionError(reason)

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('DatabaseConnectionError')
    expect(error.message).toBe(
      'Could not connect to MongoDB. Error: bad auth for mongodb://***@db.example.com',
    )
    expect(error.message).not.toContain('s3cret')
  })

  it('accepts a reason that is not an Error', () => {
    expect(new DatabaseConnectionError('timeout').message).toBe(
      'Could not connect to MongoDB. timeout',
    )
  })
})
