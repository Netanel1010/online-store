// Checks the build in dist/ for the Content-Security-Policy, and exits with 1 when a page lacks it. CI
// runs it after `npm run build`:
//
//   npm run build && npm run check:csp
//
// Every HTML file of the build has to carry exactly one policy tag and it has to be the policy of this
// build (scripts/csp.ts): the home page, the static pages made by scripts/static-routes.mjs and
// 404.html. A page made some other way, or a template that lost its marker, shows up here and not as a
// page that silently runs without a policy. The address of the API is read the way the build reads it.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { contentSecurityPolicy, policyProblems } from './csp.ts'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return htmlFiles(path)
    return entry.name.endsWith('.html') ? [path] : []
  })
}

const apiUrl = loadEnv('production', process.cwd(), 'VITE_').VITE_API_URL
const expected = contentSecurityPolicy(apiUrl)
const files = htmlFiles(dist)
const names = files.map((file) => relative(dist, file).split(sep).join('/'))

if (!names.includes('index.html') || !names.includes('404.html')) {
  console.error('dist/ has no index.html and 404.html - run the build first.')
  process.exit(1)
}

let failed = 0
for (const [index, file] of files.entries()) {
  for (const problem of policyProblems(readFileSync(file, 'utf8'), apiUrl)) {
    console.error(`FAIL  ${names[index]} ${problem}`)
    failed += 1
  }
}

if (failed > 0) process.exit(1)
console.log(`ok    ${files.length} pages (404.html among them) carry the policy of this build`)
console.log(`      ${expected}`)
