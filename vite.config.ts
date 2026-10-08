import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { resolveBasePath } from './scripts/basePath.ts'

/**
 * Tells the browser, from the first bytes of the HTML, about the API the page is going to call:
 * open the connection (DNS, TCP, TLS) now, instead of after the scripts have downloaded and run. No
 * request is started early any more: every page asks for its own products (the home page for its
 * sections, a product page for its product, a listing for its listing), so there is no one request
 * that all pages share. Without `VITE_API_URL` (development, or an API on the site's own host)
 * there is nothing to add.
 */
const HINTS_MARKER = '<!-- api-hints -->'

function apiHints(apiUrl: string | undefined): Plugin {
  return {
    name: 'api-hints',
    transformIndexHtml(html) {
      const base = apiUrl?.replace(/\/+$/, '')
      if (!base || !URL.canParse(base)) return html.replace(HINTS_MARKER + '\n    ', '')
      const origin = new URL(base).origin
      // "anonymous": the app's fetch sends no credentials, and a connection made with other
      // credentials settings would not be the one it uses.
      const tag = `<link rel="preconnect" href="${origin}" crossorigin="anonymous" />`
      return html.replace(HINTS_MARKER, tag)
    },
  }
}

// The site is served from https://<user>.github.io/online-store/ in production, so assets and the
// router basename use that sub-path unless VITE_BASE_PATH says otherwise: a host that serves the site
// from the root of its own address builds with VITE_BASE_PATH=/ (see netlify.toml). Dev serves from "/".
export default defineConfig(({ command, mode }) => ({
  base:
    command === 'build'
      ? resolveBasePath(loadEnv(mode, process.cwd(), 'VITE_').VITE_BASE_PATH)
      : '/',
  plugins: [
    react(),
    tailwindcss(),
    apiHints(command === 'build' ? loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL : undefined),
  ],
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
