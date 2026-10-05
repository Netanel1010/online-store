import type { RequestHandler } from 'express'
import { HttpError } from '../lib/httpError.ts'

/** Last route of the app: anything nothing else answered gets a JSON 404, not Express's HTML page. */
export const notFound: RequestHandler = (req) => {
  throw new HttpError(404, 'not_found', `Route not found: ${req.method} ${req.path}`)
}
