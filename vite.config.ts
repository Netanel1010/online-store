import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { catalogPagePath } from './src/lib/catalogRequest.ts'
import { escapeHtmlAttribute } from './src/lib/htmlAttribute.ts'

/**
 * Tells the browser, from the first bytes of the HTML, about the API the page is going to call:
 * open the connection (DNS, TCP, TLS) and start the catalog request now, instead of after the
 * scripts have downloaded and run. The catalog is what every page waits for, and it is the request
 * that also wakes a sleeping API host, so starting it early is the biggest saving available on the
 * site's side. Without `VITE_API_URL` (development, or an API on the site's own host) there is
 * nothing to add.
 */
const HINTS_MARKER = '<!-- api-hints -->'

function apiHints(apiUrl: string | undefined): Plugin {
  return {
    name: 'api-hints',
    transformIndexHtml(html) {
      const base = apiUrl?.replace(/\/+$/, '')
      if (!base || !URL.canParse(base)) return html.replace(HINTS_MARKER + '\n    ', '')
      const origin = new URL(base).origin
      // "anonymous": the app's fetch sends no credentials, and a connection or a preload made with
      // other credentials settings would not be the one it uses.
      const tags = [
        `<link rel="preconnect" href="${origin}" crossorigin="anonymous" />`,
        `<link rel="preload" as="fetch" href="${escapeHtmlAttribute(base + catalogPagePath(1))}" crossorigin="anonymous" />`,
      ].join('\n    ')
      return html.replace(HINTS_MARKER, tags)
    },
  }
}

// The site is served from https://<user>.github.io/online-store/ in production,
// so assets and the router basename must use that sub-path. Dev serves from "/".
export default defineConfig(({ command, mode }) => ({
  base: command === 'build' ? '/online-store/' : '/',
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
