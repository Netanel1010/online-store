// GitHub Pages cannot rewrite unknown paths to index.html, so deep links such as
// /online-store/products would 404. Pages serves 404.html for unknown paths, so a
// copy of the SPA entry point lets BrowserRouter resolve those routes client-side.
import { copyFileSync, existsSync } from 'node:fs'

const index = new URL('../dist/index.html', import.meta.url)
const fallback = new URL('../dist/404.html', import.meta.url)

if (!existsSync(index)) {
  console.error('dist/index.html not found - run the build first.')
  process.exit(1)
}

copyFileSync(index, fallback)
console.log('Created dist/404.html (SPA fallback for GitHub Pages)')
