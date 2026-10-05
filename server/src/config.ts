import { z } from 'zod'

const DEV_CORS_ORIGINS = 'http://localhost:5173,http://localhost:4173'

const isOrigin = (value: string) => URL.canParse(value) && new URL(value).origin === value

// A placeholder for an unset variable (`MONGODB_URI=` in a copied .env) counts as unset.
const emptyIsUnset = (value: string | undefined) => (value === '' ? undefined : value)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGINS: z
    .string()
    .default(DEV_CORS_ORIGINS)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .refine((origins) => origins.every(isOrigin), {
      message: 'must be origins like https://example.com, without a path or a trailing slash',
    }),
  // The message of a failed check never repeats the value: a connection string holds a password.
  MONGODB_URI: z
    .string()
    .trim()
    .optional()
    .transform(emptyIsUnset)
    .refine((uri) => uri === undefined || /^mongodb(\+srv)?:\/\//.test(uri), {
      message: 'must start with mongodb:// or mongodb+srv://',
    }),
  MONGODB_DB_NAME: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,38}$/, {
      message: 'must be 1 to 38 letters, digits, underscores or hyphens',
    })
    .default('online-store'),
  MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
})

export interface Config {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  /** Browser origins that may call the API. */
  corsOrigins: string[]
  /** The database connection, or null when no `MONGODB_URI` is set (development and test only). */
  mongodb: MongoConfig | null
}

export interface MongoConfig {
  /** Holds the password: never log it or put it in a response. */
  uri: string
  dbName: string
  /** How long to look for a reachable server before giving up. */
  connectTimeoutMs: number
}

/**
 * Reads and validates the environment once, at startup, so a wrong value stops the server with a
 * clear message instead of failing later at the first request.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`)
  }
  const { NODE_ENV, PORT, CORS_ORIGINS, MONGODB_URI, MONGODB_DB_NAME, MONGODB_CONNECT_TIMEOUT_MS } =
    result.data

  // The development defaults are the local Vite servers. They must never be what a deployed API
  // silently falls back to, so production has to name its frontend.
  if (NODE_ENV === 'production' && env.CORS_ORIGINS === undefined) {
    throw new Error('Invalid environment configuration:\nCORS_ORIGINS is required in production')
  }

  // Elsewhere the API can run without a database, so working on the frontend or on routes that do
  // not need data takes no MongoDB. A deployed API without one would be broken, so it must say so.
  if (NODE_ENV === 'production' && MONGODB_URI === undefined) {
    throw new Error('Invalid environment configuration:\nMONGODB_URI is required in production')
  }

  return {
    nodeEnv: NODE_ENV,
    port: PORT,
    corsOrigins: CORS_ORIGINS,
    mongodb:
      MONGODB_URI === undefined
        ? null
        : {
            uri: MONGODB_URI,
            dbName: MONGODB_DB_NAME,
            connectTimeoutMs: MONGODB_CONNECT_TIMEOUT_MS,
          },
  }
}
