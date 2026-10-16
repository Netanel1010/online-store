import { describe, expect, it } from 'vitest'
import { COMMON_PASSWORDS } from '../src/features/auth/commonPasswords.data.ts'
import dataFile from '../src/features/auth/commonPasswords.data.ts?raw'
import notices from '../THIRD_PARTY_NOTICES.md?raw'
import {
  SOURCE,
  dataModule,
  filterCommonPasswords,
  gitBlobSha1,
  sha256,
  sourceProblems,
} from './commonPasswords.mjs'

const chr = (code) => String.fromCharCode(code)

describe('the pinned source of the list', () => {
  it('is one commit of SecLists and one file of it, and the address says so', () => {
    expect(SOURCE.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(SOURCE.url).toBe(
      `https://raw.githubusercontent.com/danielmiessler/SecLists/${SOURCE.commit}/Passwords/Common-Credentials/10k-most-common.txt`,
    )
    expect(SOURCE.gitBlobSha1).toMatch(/^[0-9a-f]{40}$/)
    expect(SOURCE.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is the revision that the data file and the notices name', () => {
    for (const text of [dataFile, notices]) {
      expect(text).toContain(SOURCE.commit)
      expect(text).toContain(SOURCE.gitBlobSha1)
      expect(text).toContain(SOURCE.sha256)
      expect(text).toContain(SOURCE.original.author)
      expect(text).toContain(SOURCE.original.licenceUrl)
    }
  })

  it('hashes a file as Git does', () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(gitBlobSha1('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('refuses a file that is not the pinned revision, and says how', () => {
    const problems = sourceProblems('password\n12345678\n')

    expect(problems).toHaveLength(3)
    expect(problems[0]).toContain(`expected ${SOURCE.bytes}`)
    expect(problems.join('\n')).toContain(SOURCE.gitBlobSha1)
    expect(problems.join('\n')).toContain(SOURCE.sha256)
  })

  it('refuses a file of the right size whose content is not the pinned one (a single entry changed)', () => {
    const changed = `${'x'.repeat(SOURCE.bytes - 9)}66668888\n`

    expect(changed.length).toBe(SOURCE.bytes)
    expect(sourceProblems(changed).length).toBeGreaterThan(0)
  })
})

describe('filterCommonPasswords', () => {
  it('keeps the entries of eight characters or more, once, in order', () => {
    expect(filterCommonPasswords('zzzzzzzz\npassword\n12345678\npassword\nabc\n')).toEqual([
      '12345678',
      'password',
      'zzzzzzzz',
    ])
  })

  it('reads a list written with CRLF and without a last line break the same way', () => {
    expect(filterCommonPasswords('password\r\n12345678\r\n')).toEqual(['12345678', 'password'])
    expect(filterCommonPasswords('password\n12345678')).toEqual(['12345678', 'password'])
  })

  it('puts every entry in lower case and in NFKC, and then counts the same entry once', () => {
    expect(filterCommonPasswords('Password1\nPASSWORD1\npassword1\nｐａｓｓｗｏｒｄ１\n')).toEqual([
      'password1',
    ])
  })

  it('counts the length after NFKC, in code points', () => {
    // Eight code points that NFKC makes four ("e" and an accent become one letter): not an entry.
    expect(filterCommonPasswords(`${('e' + chr(0x301)).repeat(4)}\n`)).toEqual([])
    // Four emoji and four letters are eight characters, though sixteen UTF-16 units.
    const emoji = String.fromCodePoint(0x1f600)
    expect(filterCommonPasswords(`abcd${emoji.repeat(4)}\n`)).toHaveLength(1)
  })

  it('drops the entries that are shorter than a password can be, and longer than one can be', () => {
    expect(filterCommonPasswords('1234567\n')).toEqual([])
    expect(filterCommonPasswords('12345678\n')).toEqual(['12345678'])
    expect(filterCommonPasswords(`${'a'.repeat(128)}\n`)).toHaveLength(1)
    expect(filterCommonPasswords(`${'a'.repeat(129)}\n`)).toEqual([])
  })

  it('drops blank lines and an entry that is not well formed', () => {
    expect(filterCommonPasswords(`\n\npassword\n${chr(0xd800)}abcdefgh\n`)).toEqual(['password'])
  })

  it('keeps a space in an entry, as it is part of a password', () => {
    expect(filterCommonPasswords('pass word1\n')).toEqual(['pass word1'])
  })

  it('sorts by code point, not by the locale', () => {
    expect(filterCommonPasswords('bbbbbbbb\nAAAAAAAA\n11111111\nzzzzzzzz\n')).toEqual([
      '11111111',
      'aaaaaaaa',
      'bbbbbbbb',
      'zzzzzzzz',
    ])
  })
})

describe('dataModule', () => {
  it('writes a header with the author, the licence and the changes, and then the entries', () => {
    const text = dataModule(['11111111', 'password'])

    expect(text.startsWith('/*!')).toBe(true)
    expect(text).toContain('Mark Burnett (xato.net)')
    expect(text).toContain('2 entries are left of the 10000')
    expect(text).toContain(
      'export const COMMON_PASSWORDS: readonly string[] = ["11111111","password"]',
    )
  })

  it('writes an entry with a quote or a backslash as a string, whatever it holds', () => {
    const entries = [`it's"quoted"`, 'back\\slash']
    const text = dataModule(entries)
    const literal = text.slice(text.indexOf('= [') + 2)

    expect(JSON.parse(literal)).toEqual(entries)
  })
})

describe('the data file in the repository', () => {
  it('has the entries that the pinned list gives, in the order of the generator', () => {
    // The generator reads the list from the network and is run by hand, so this cannot make the list
    // again. It holds the file to what the generator makes of any list: sorted, once, folded, in range.
    const again = filterCommonPasswords(`${COMMON_PASSWORDS.join('\n')}\n`)

    expect(again).toEqual([...COMMON_PASSWORDS])
  })
})
