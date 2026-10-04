// A tiny static server that behaves like GitHub Pages for this project, used by the E2E tests:
//
//  - the built site (dist/) is served under /online-store/
//  - a path that matches no file answers with dist/404.html and a 404 status, which is what
//    GitHub Pages does and what lets deep links such as /online-store/products/x reach the app
//
// `vite preview` would hide both behaviours (it falls back to index.html with a 200), so it
// could not catch a broken base path or a broken 404.html fallback.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

const port = Number(process.env.E2E_PORT ?? 4173)
const base = '/online-store/'
const root = resolve(process.env.E2E_DIST ?? 'dist')

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

function resolveFile(pathname) {
  if (!pathname.startsWith(base)) return null
  const relative = normalize(decodeURIComponent(pathname.slice(base.length)))
  const file = join(root, relative)
  // Never serve anything outside dist/.
  if (file !== root && !file.startsWith(root + sep)) return null
  if (existsSync(file) && statSync(file).isDirectory()) return join(file, 'index.html')
  return existsSync(file) ? file : null
}

function send(response, status, file) {
  response.writeHead(status, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  response.end(readFileSync(file))
}

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No build found in ${root}. Run "npm run build" first.`)
  process.exit(1)
}

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  const file = resolveFile(pathname)
  if (file) send(response, 200, file)
  else send(response, 404, join(root, '404.html'))
}).listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}${base} (GitHub Pages behaviour)`)
})
