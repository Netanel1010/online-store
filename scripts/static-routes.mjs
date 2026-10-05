// GitHub Pages serves a page only if a file exists for it; anything else gets 404.html with a
// 404 status. That is fine for visitors (the app starts from 404.html), but search engines do not
// index a 404, and link previews read the HTML without running the app. So at build time this
// writes, for every page worth indexing, its own copy of the app's HTML with that page's title,
// description, canonical URL, social tags and structured data already in it. The app itself is
// the same on every copy.
//
//   dist/index.html                  home
//   dist/products/index.html         all products
//   dist/category/<id>/index.html    one per category that has products
//   dist/products/<sku>/index.html   one per product
//   dist/404.html                    every other path (cart, login, search, ...): noindex
//   dist/sitemap.xml                 the pages above
//
// The tags come from src/lib/seo.ts, the same code the app uses while the visitor navigates.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findCategory } from '../src/features/products/categories.ts'
import {
  categoryMeta,
  homeMeta,
  pageUrl,
  productMeta,
  productsMeta,
  renderSeoTags,
} from '../src/lib/seo.ts'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const START = '<!-- seo:start -->'
const END = '<!-- seo:end -->'

const template = readFileSync(join(dist, 'index.html'), 'utf8')
const start = template.indexOf(START)
const end = template.indexOf(END)
if (start === -1 || end === -1 || end < start) {
  console.error(`dist/index.html has no ${START} ... ${END} block - check index.html.`)
  process.exit(1)
}

function withTags(meta) {
  return `${template.slice(0, start + START.length)}\n    ${renderSeoTags(meta)}\n    ${template.slice(end)}`
}

function writePage(path, meta) {
  const file = path === '' ? join(dist, 'index.html') : join(dist, path, 'index.html')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, withTags(meta))
}

const products = JSON.parse(readFileSync(join(dist, 'data', 'products.json'), 'utf8'))
const pages = [
  { path: '', meta: homeMeta() },
  { path: 'products', meta: productsMeta() },
]

const categoryIds = [...new Set(products.map((product) => product.category))]
for (const id of categoryIds) {
  const category = findCategory(id)
  if (category) pages.push({ path: `category/${id}`, meta: categoryMeta(category) })
}
for (const product of products) {
  const meta = productMeta(product, findCategory(product.category))
  pages.push({ path: meta.path, meta })
}

for (const { path, meta } of pages) writePage(path, meta)

// Any other path is answered with 404.html. None of those pages should be indexed, so it carries
// `noindex` (no `path`) and no canonical URL; the app sets the real title once it runs.
const { title, description } = homeMeta()
writeFileSync(join(dist, '404.html'), withTags({ title, description }))

const urls = pages.map(({ path }) => `  <url><loc>${pageUrl(path)}</loc></url>`).join('\n')
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
)

console.log(`Wrote ${pages.length} static pages, dist/404.html and dist/sitemap.xml`)
