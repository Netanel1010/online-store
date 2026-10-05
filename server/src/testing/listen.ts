import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Express } from 'express'

/** Starts an app on a free port for one test file, so tests can use the real `fetch`. */
export async function listen(app: Express) {
  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started))
  })
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        // fetch keeps connections alive; without this close() would wait for them.
        server.closeAllConnections()
      }),
  }
}
