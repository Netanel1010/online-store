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
    // Playwright specs run in a real browser through `npm run test:e2e`, not in Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
