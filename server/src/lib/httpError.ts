/**
 * An error a route can throw on purpose. The error handler turns it into a response with this
 * status, code and message, so they are written for the client: never put internal details in them.
 * `headers` are sent with the response, for the few answers that need one (`WWW-Authenticate`,
 * `Retry-After`).
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly headers: Readonly<Record<string, string>>

  constructor(
    status: number,
    code: string,
    message: string,
    headers: Readonly<Record<string, string>> = {},
  ) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.headers = headers
  }
}
