import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The site is served from https://<user>.github.io/online-store/ in production,
// so assets and the router basename must use that sub-path. Dev serves from "/".
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/online-store/' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Libraries change much less often than the app. Keeping them in their own files means a
        // returning visitor only downloads the app code again after a deployment. The form
        // libraries are left out on purpose: they belong to the lazily loaded pages.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          if (id.includes('react-router') || id.includes('zustand')) return 'router'
          if (id.includes('node_modules/zod')) return 'zod'
          return undefined
        },
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
}))
