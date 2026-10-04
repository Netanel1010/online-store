import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The site is served from https://<user>.github.io/online-store/ in production,
// so assets and the router basename must use that sub-path. Dev serves from "/".
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/online-store/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
}))
