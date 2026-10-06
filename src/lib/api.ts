/**
 * Where the API is, from `VITE_API_URL` at build time (for example `https://api.example.com`).
 * While developing it defaults to the API of `npm run dev:server`, whose CORS settings already
 * allow the Vite dev server. In a production build with no `VITE_API_URL` the address is relative
 * (`/api/...`), for an API served from the same host as the site.
 */
const configured: string | undefined = import.meta.env.VITE_API_URL
const base = (configured ?? (import.meta.env.DEV ? 'http://localhost:3001' : '')).replace(
  /\/+$/,
  '',
)

/** The full address of an API path such as `/api/products`. */
export function apiUrl(path: string): string {
  return `${base}${path}`
}
