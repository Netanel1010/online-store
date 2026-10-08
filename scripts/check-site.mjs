// Checks a deployed site from the outside, the way a visitor or a crawler reaches it, and exits with 1
// at the first problem. It is run every night by the `smoke` workflow, next to check-api.mjs, and by
// hand after a deployment:
//
//   SITE_URL=https://owner.github.io/online-store/ npm run check:site
//
//  - SITE_URL  the address of the site with its base path (a closing slash is added)
//
// It reads public addresses only: the home page, the sitemap, the static page of the first product the
// sitemap lists, and an address that is not a page. It creates nothing and signs nobody in.

import { siteProblems } from './siteSmoke.mjs'

const raw = process.env.SITE_URL ?? ''
if (!URL.canParse(raw)) {
  console.error('SITE_URL is required, for example https://owner.github.io/online-store/')
  process.exit(1)
}
const base = `${raw.replace(/\/+$/, '')}/`

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(30_000) })
  return {
    status: response.status,
    type: response.headers.get('content-type') ?? '',
    text: await response.text(),
  }
}

function fail(message) {
  console.error(`FAIL  ${message}`)
  process.exit(1)
}

const sitemap = await get('sitemap.xml')
const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const sku = new RegExp(`<loc>${escaped}products/([^/<]+)/</loc>`).exec(sitemap.text)?.[1]
if (sitemap.status !== 200 || !sku) {
  fail(`sitemap.xml (HTTP ${sitemap.status}) does not list a product page under ${base}`)
}

const [home, product, unknown] = await Promise.all([
  get(''),
  get(`products/${sku}/`),
  get(`no-such-page-${Date.now()}`),
])

const problems = siteProblems({ base, sku, home, product, sitemap, unknown })
if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL  ${problem}`)
  process.exit(1)
}

console.log(`ok    the home page mounts the app under ${new URL(base).pathname}`)
console.log(`ok    the static page of product ${sku} has its canonical address and structured data`)
console.log('ok    sitemap.xml lists it')
console.log('ok    an address that is not a page answers 404 and is not indexed')
console.log('\nThe site is up.')
