import { createApp } from './app.ts'
import { loadConfig } from './config.ts'

function start() {
  const config = loadConfig()
  const server = createApp(config).listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port} (${config.nodeEnv})`)
  })

  // Hosts stop a container with SIGTERM: finish the requests in progress, then exit. The timer
  // makes sure a stuck connection cannot keep the process alive for ever.
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

try {
  start()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
