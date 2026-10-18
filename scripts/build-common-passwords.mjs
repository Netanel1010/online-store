// Makes src/features/auth/commonPasswords.data.ts: the list of common passwords that a new password is
// checked against. It is run by hand, when the list is to be renewed, and its result is committed:
//
//   npm run build:common-passwords                 fetches the pinned revision of the list
//   npm run build:common-passwords -- <file>       reads a copy of it that was downloaded already
//
// Nothing downloads the list at any other time: not the build, not the tests, not the server. The file
// is refused unless it is exactly the pinned revision (scripts/commonPasswords.mjs), so a list that was
// changed at its source cannot get in without this file and THIRD_PARTY_NOTICES.md being changed too.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import { SOURCE, dataModule, filterCommonPasswords, sourceProblems } from './commonPasswords.mjs'

const output = fileURLToPath(
  new URL('../src/features/auth/commonPasswords.data.ts', import.meta.url),
)

async function read(file) {
  if (file) return readFileSync(file)
  console.log(`Fetching ${SOURCE.url}`)
  const response = await fetch(SOURCE.url)
  if (!response.ok) throw new Error(`The list could not be fetched: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

const content = await read(process.argv[2])
const problems = sourceProblems(content)
if (problems.length > 0) {
  console.error('This is not the pinned revision of the list, so it was not used:')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

const entries = filterCommonPasswords(content.toString('utf8'))
const source = dataModule(entries)
const formatted = await format(source, { ...(await resolveConfig(output)), filepath: output })
writeFileSync(output, formatted)

console.log(
  `${entries.length} entries written to ${output} (${Buffer.byteLength(formatted)} bytes).`,
)
