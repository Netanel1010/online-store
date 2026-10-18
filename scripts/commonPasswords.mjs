// What scripts/build-common-passwords.mjs is made of, apart from the network and the disk, so that it can
// be tested: where the list comes from (pinned to one revision), how it is read, and how the data file is
// written. See THIRD_PARTY_NOTICES.md for the licence of the list.

import { createHash } from 'node:crypto'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordIsWellFormed,
  passwordKey,
  passwordLength,
} from '../src/features/auth/rules.ts'

/**
 * The one revision of the list that is used. It is pinned by the commit of the repository and checked by
 * the hash of the file, so a copy that was changed (by anyone, at any time) is refused instead of read.
 * To use a newer revision, read its history first, change these values and the notices together.
 */
export const SOURCE = {
  repository: 'https://github.com/danielmiessler/SecLists',
  commit: 'a3416ba7062a1bc2ec6b0fe76eac7ee16c80521b',
  path: 'Passwords/Common-Credentials/10k-most-common.txt',
  /** `git hash-object` of the file at that commit. */
  gitBlobSha1: 'c03abe883df8a88b7ead0a97b9862937ea6266de',
  sha256: '4adb3f0afb4a10cf19ebe48d8c69a46f934bbc8d77c694c210564f9583e7f4ba',
  bytes: 73017,
  /** Lines in the file. */
  lines: 10000,
  /** Where the list came from before SecLists took it (its first commit says so), and the author's page. */
  original: {
    title: '10,000 Most Common Passwords List',
    author: 'Mark Burnett (xato.net)',
    page: 'https://xato.net/passwords/more-top-worst-passwords/',
    archivedPage:
      'https://web.archive.org/web/20141206003316/https://xato.net/passwords/more-top-worst-passwords/',
    licence: 'Creative Commons Attribution-ShareAlike 3.0 Unported',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  },
}
SOURCE.url = `https://raw.githubusercontent.com/danielmiessler/SecLists/${SOURCE.commit}/${SOURCE.path}`

/** The hash that Git gives a file: SHA-1 of "blob <size>", a NUL, and the content. */
export function gitBlobSha1(content) {
  const bytes = Buffer.from(content)
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

export const sha256 = (content) => createHash('sha256').update(Buffer.from(content)).digest('hex')

/** Why a file is not the pinned revision, or an empty list when it is. */
export function sourceProblems(content) {
  const problems = []
  const bytes = Buffer.from(content)
  if (bytes.length !== SOURCE.bytes)
    problems.push(`${bytes.length} bytes, expected ${SOURCE.bytes}`)
  if (gitBlobSha1(bytes) !== SOURCE.gitBlobSha1) {
    problems.push(`git blob ${gitBlobSha1(bytes)}, expected ${SOURCE.gitBlobSha1}`)
  }
  if (sha256(bytes) !== SOURCE.sha256)
    problems.push(`sha256 ${sha256(bytes)}, expected ${SOURCE.sha256}`)
  return problems
}

/**
 * The entries that are kept, in code point order. Every line is read the way a password is compared
 * (NFKC and lower case, see `passwordKey`), and is kept only if it could be chosen as a password at all:
 * well formed, and from the shortest to the longest length that is allowed. The rest could never be
 * matched (a shorter or a longer password is refused by its length first), so they would only be weight.
 */
export function filterCommonPasswords(text) {
  const kept = new Set()
  for (const line of text.split('\n')) {
    const entry = passwordKey(line.replace(/\r$/, ''))
    if (entry === '' || !passwordIsWellFormed(entry)) continue
    const length = passwordLength(entry)
    if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) continue
    kept.add(entry)
  }
  return [...kept].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** The text of `src/features/auth/commonPasswords.data.ts`, before it is formatted. */
export function dataModule(entries, { generatedBy = 'scripts/build-common-passwords.mjs' } = {}) {
  const { original } = SOURCE
  return `/*!
 * The most common passwords of eight characters or more, to refuse as a new password.
 *
 * This file is an adaptation of the "${original.title}", which is the work of ${original.author}:
 *   ${original.page}
 *   (archived: ${original.archivedPage})
 * and it is licensed under the same licence as that work, the ${original.licence} licence:
 *   ${original.licenceUrl}
 * The licence of this file is not the licence of the rest of this repository (MIT, see LICENSE): it covers
 * this file only. See THIRD_PARTY_NOTICES.md.
 *
 * The list was taken from SecLists (${SOURCE.repository}, MIT licence, copyright 2018 Daniel Miessler),
 * ${SOURCE.path} at commit ${SOURCE.commit}
 * (git blob ${SOURCE.gitBlobSha1}, SHA-256 ${SOURCE.sha256}).
 *
 * Changes made to the list: every entry was put in Unicode NFKC and in lower case; the entries with fewer
 * than ${PASSWORD_MIN_LENGTH} or more than ${PASSWORD_MAX_LENGTH} characters, which are not accepted as a password anyway, were removed;
 * duplicates were removed; the rest was sorted. ${entries.length} entries are left of the ${SOURCE.lines} that the list has.
 */

/** Generated by ${generatedBy}. Do not edit it by hand: run that script. */
export const COMMON_PASSWORDS: readonly string[] = ${JSON.stringify(entries)}
`
}
