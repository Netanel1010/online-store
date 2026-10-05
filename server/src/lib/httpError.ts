/**
 * An error a route can throw on purpose. The error handler turns it into a response with this
 * status, code and message, so they are written for the client: never put internal details in them.
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}
