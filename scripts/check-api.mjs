// Checks a running API the way the deployed site uses it, and exits with 1 at the first problem.
// It is run by the deploy job before the site is published (so a site that could not load its
// products is never deployed), and by hand after the API is deployed or changed:
//
//   API_URL=https://example.onrender.com SITE_ORIGIN=https://owner.github.io npm run check:api
//
//  - API_URL      where the API is (no trailing slash needed)
//  - SITE_ORIGIN  the origin of the deployed site, which CORS must allow
//  - WAIT_SECONDS how long to wait for a sleeping host to wake up and reach its database
//                 (default 300: a free host can take about a minute)
//
//  - STRICT_HARDENING=1  also fail (not just warn) when the HTTP hardening of the API is not in
//                 place: security headers, CORS, caching (see apiHardening.mjs). The deploy job
//                 runs this against the API that is deployed *now*, which is the version before
//                 the one being deployed, so by default a missing header is only reported.
//                 Run it with STRICT_HARDENING=1 by hand once the new API is live.
//
// Only public, read-only addresses are used, and nothing secret is read or printed.

import { hardeningProblems } from './apiHardening.mjs'

const api = (process.env.API_URL ?? '').replace(/\/+$/, '')
const origin = process.env.SITE_ORIGIN
const waitSeconds = Number(process.env.WAIT_SECONDS ?? 300)

if (!api || !origin) {
  console.error('API_URL and SITE_ORIGIN are required.')
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fail(message) {
  console.error(`FAIL  ${message}`)
  process.exit(1)
}

async function get(path, headers = {}) {
  const response = await fetch(`${api}${path}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    // Not JSON: the checks below say what was expected.
  }
  return { response, body }
}

function expect(condition, message) {
  if (!condition) fail(message)
  console.log(`ok    ${message}`)
}

// 1. A host that was asleep needs time to start, and then to reach the database.
const deadline = Date.now() + waitSeconds * 1000
let ready = false
for (let attempt = 1; !ready; attempt++) {
  try {
    const { response, body } = await get('/api/health/ready')
    ready = response.status === 200 && body?.database === 'up'
    if (!ready) console.log(`wait  attempt ${attempt}: HTTP ${response.status}, not ready yet`)
  } catch (error) {
    console.log(`wait  attempt ${attempt}: ${error instanceof Error ? error.message : error}`)
  }
  if (ready) break
  if (Date.now() > deadline)
    fail(`/api/health/ready did not report the database up in ${waitSeconds}s`)
  await sleep(10_000)
}
console.log('ok    /api/health/ready: the API is up and its database answers')

// 2. The process itself.
const health = await get('/api/health')
expect(health.response.status === 200 && health.body?.status === 'ok', '/api/health answers ok')

// 3. The products, as the site reads them.
const list = await get('/api/products?page=1&limit=5', { Origin: origin })
expect(list.response.status === 200, 'GET /api/products answers 200')
expect(
  Array.isArray(list.body?.items) && list.body.items.length > 0 && list.body.total > 0,
  `the catalog is not empty (${list.body?.total} products)`,
)
expect(
  list.body.items.every((item) => typeof item.id === 'string' && !('_id' in item)),
  'products have an id and no MongoDB _id',
)

// 4. CORS: the deployed site may read the answer, other sites may not.
expect(
  list.response.headers.get('access-control-allow-origin') === origin,
  `CORS allows the site origin ${origin}`,
)
const stranger = await get('/api/products?limit=1', { Origin: 'https://not-allowed.example.com' })
expect(
  stranger.response.headers.get('access-control-allow-origin') === null,
  'CORS does not allow another origin',
)

// 5. One product, and a product that does not exist.
const id = list.body.items[0].id
const detail = await get(`/api/products/${encodeURIComponent(id)}`, { Origin: origin })
expect(
  detail.response.status === 200 && detail.body?.id === id,
  `GET /api/products/${id} answers 200`,
)

const missing = await get('/api/products/NO-SUCH-SKU', { Origin: origin })
expect(
  missing.response.status === 404 && missing.body?.error?.code === 'product_not_found',
  'an unknown product answers 404 product_not_found',
)

// 6. HTTP hardening: what a browser is told about the answers. Reported as warnings unless
// STRICT_HARDENING=1, so deploying the change that adds them is not blocked by their absence.
const preflight = await fetch(`${api}/api/auth/login`, {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type',
  },
  signal: AbortSignal.timeout(30_000),
})
expect(
  preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === origin,
  'the preflight of a sign-in request is allowed for the site',
)
const problems = hardeningProblems({
  product: list.response.headers,
  missing: missing.response.headers,
  preflight: preflight.headers,
  https: api.startsWith('https://'),
})
for (const problem of problems) {
  if (process.env.STRICT_HARDENING === '1') fail(problem)
  console.log(`warn  ${problem}`)
}
if (problems.length === 0)
  console.log('ok    HTTP hardening: headers, CORS and caching are as expected')

console.log('\nThe API is ready for the site.')
