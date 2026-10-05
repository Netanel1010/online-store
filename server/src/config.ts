import { z } from 'zod'

const DEV_CORS_ORIGINS = 'http://localhost:5173,http://localhost:4173'

const isOrigin = (value: string) => URL.canParse(value) && new URL(value).origin === value

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
})

export interface Config {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  /** Browser origins that may call the API. */
  corsOrigins: string[]
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
  const { NODE_ENV, PORT, CORS_ORIGINS } = result.data

  // The development defaults are the local Vite servers. They must never be what a deployed API
  // silently falls back to, so production has to name its frontend.
  if (NODE_ENV === 'production' && env.CORS_ORIGINS === undefined) {
    throw new Error('Invalid environment configuration:\nCORS_ORIGINS is required in production')
  }

  return { nodeEnv: NODE_ENV, port: PORT, corsOrigins: CORS_ORIGINS }
}
