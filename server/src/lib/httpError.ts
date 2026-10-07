/**
 * An error a route can throw on purpose. The error handler turns it into a response with this
 * status, code and message, so they are written for the client: never put internal details in them.
 * `headers` are sent with the response, for the few answers that need one (`WWW-Authenticate`,
 * `Retry-After`). `details` are extra facts a client can act on, such as which products are
 * unavailable or what the total is now: plain data, written for the client like the message.
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly headers: Readonly<Record<string, string>>
  readonly details: Readonly<Record<string, unknown>>

  constructor(
    status: number,
    code: string,
    message: string,
    headers: Readonly<Record<string, string>> = {},
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.headers = headers
    this.details = details
  }
}
