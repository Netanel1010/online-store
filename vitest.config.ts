import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // The default forks pool fails to start workers when the project path contains
    // non-ASCII characters on Windows; worker threads behave the same on every OS.
    pool: 'threads',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Some component tests walk through several pages (register, redirect, fill a form). They take
    // about 2-3 s alone but close to the 5 s default when all test files run in parallel on a busy
    // or small machine, which made them intermittently time out. A real hang still fails promptly.
    testTimeout: 15_000,
    // Playwright specs run in a real browser through `npm run test:e2e`, not in Vitest. The API
    // has its own config and runs in Node, through `npm run test:server`.
    exclude: [...configDefaults.exclude, 'e2e/**', 'server/**'],
  },
})
