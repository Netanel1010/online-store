import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Same reason as in the frontend config: the default forks pool fails to start workers when
    // the project path contains non-ASCII characters on Windows.
    pool: 'threads',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
