// Checks the build in dist/ against the weight budget of the first page (see bundleBudget.mjs), and
// exits with 1 when it is over. CI runs it after `npm run build`:
//
//   npm run build && npm run check:bundle
//
// A change that makes the first page heavier has to say so: raise the budget in bundleBudget.mjs in the
// same pull request, with the reason, or move the weight to a lazily loaded page.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { BUDGET, budgetProblems, initialAssets } from './bundleBudget.mjs'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const base = '/online-store/'

const html = readFileSync(join(dist, 'index.html'), 'utf8')
const files = initialAssets(html, base).map(({ path, kind }) => ({
  path,
  kind,
  bytes: gzipSync(readFileSync(join(dist, path))).length,
}))

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`
for (const kind of ['javascript', 'stylesheet']) {
  const own = files.filter((file) => file.kind === kind)
  const total = own.reduce((sum, file) => sum + file.bytes, 0)
  console.log(
    `${kind.padEnd(10)} ${kib(total)} gzipped in ${own.length} file(s), budget ${kib(BUDGET[kind])}`,
  )
}

const problems = budgetProblems(files)
if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL  ${problem}`)
  process.exit(1)
}
console.log('The first page is within its budget.')
