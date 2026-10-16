// Checks the build in dist/ for the notice of the list of common passwords, and exits with 1 when the
// list is in the build without it. CI runs it after `npm run build`:
//
//   npm run build && npm run check:notices
//
// The list (src/features/auth/commonPasswords.data.ts) is under the licence of its author, which asks for
// the author to be credited and for the licence to go with every copy. The notice is a comment at the top
// of the file, and the build keeps it (vite.config.ts); this finds the day that stops being true.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMMON_PASSWORDS } from '../src/features/auth/commonPasswords.data.ts'
import { noticeProblems } from './notices.mjs'

const assets = fileURLToPath(new URL('../dist/assets/', import.meta.url))
const chunks = readdirSync(assets)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ name, text: readFileSync(join(assets, name), 'utf8') }))

const problems = noticeProblems(chunks, COMMON_PASSWORDS)
if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL  ${problem}`)
  process.exit(1)
}
console.log('ok    the build carries the notice of the list of common passwords with the list')
