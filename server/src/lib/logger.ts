import { redactUri } from '../db/errors.ts'

/**
 * What the server writes its log lines with. `error` takes the error first, then facts about where
 * it happened (the request id). `info` and `warn` are optional so a test can pass only `error`.
 */
export interface Logger {
  error: (error: unknown, fields?: Record<string, unknown>) => void
  info?: (message: string, fields?: Record<string, unknown>) => void
  warn?: (message: string, fields?: Record<string, unknown>) => void
}

/** A logger that writes nothing, for an app that is built without one (most tests). */
export const silentLogger: Logger = { error: () => {}, info: () => {}, warn: () => {} }

/**
 * Hides what must never reach a log from a piece of text: the credentials of a connection string
 * and the value of a bearer token (an `Authorization` header that an error message repeats).
 */
export function redactSecrets(text: string): string {
  return redactUri(text).replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer ***')
}

/** Names whose value is never logged, whatever it is, wherever it is found in the fields. */
const SECRET_KEY =
  /authori[sz]ation|password|passwd|token|secret|cookie|credential|api[-_]?key|^uri$|[a-z_]uri$/i

const MAX_DEPTH = 4

/** Copies a value for logging with every secret hidden. Text is redacted, secret names are masked. */
export function scrub(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactSecrets(value)
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Error) return { name: value.name, message: redactSecrets(value.message) }
  if (depth >= MAX_DEPTH) return '[too deep]'
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? '[redacted]' : scrub(item, depth + 1),
    ]),
  )
}

type Write = (line: string) => void

const stdout: Write = (line) => process.stdout.write(`${line}\n`)
const stderr: Write = (line) => process.stderr.write(`${line}\n`)

/** The fields of an error: what it is, what it says, where it came from, and why (its cause). */
function describeError(error: unknown) {
  if (!(error instanceof Error)) return { message: redactSecrets(String(error)) }
  const cause = error.cause instanceof Error ? error.cause : undefined
  return {
    errorName: error.name,
    message: redactSecrets(error.message),
    stack: error.stack ? redactSecrets(error.stack) : undefined,
    ...(cause && { cause: `${cause.name}: ${redactSecrets(cause.message)}` }),
  }
}

/**
 * One JSON object per line on the standard output (errors on the standard error), which is what a
 * host's log viewer can search and filter by field. Every value goes through `scrub` first, so a
 * secret that ends up in a message or a field does not reach the log. `write` is for tests.
 */
export function createJsonLogger({
  write = stdout,
  writeError = stderr,
  now = () => new Date(),
}: { write?: Write; writeError?: Write; now?: () => Date } = {}): Required<Logger> {
  const line = (level: string, message: string, fields: Record<string, unknown> = {}) =>
    JSON.stringify({ level, time: now().toISOString(), msg: message, ...(scrub(fields) as object) })

  return {
    info: (message, fields) => write(line('info', redactSecrets(message), fields)),
    warn: (message, fields) => write(line('warn', redactSecrets(message), fields)),
    error: (error, fields) => {
      const { message, ...details } = describeError(error)
      writeError(line('error', message, { ...details, ...fields }))
    },
  }
}
