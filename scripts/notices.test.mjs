import { describe, expect, it } from 'vitest'
import { REQUIRED_IN_THE_NOTICE, noticeProblems } from './notices.mjs'

const ENTRIES = Array.from({ length: 100 }, (_, i) => `entry-number-${i}`)
const NOTICE = `/*! ${REQUIRED_IN_THE_NOTICE.join(' ')} */`
const LIST = `[${ENTRIES.map((e) => `\`${e}\``).join(',')}]`

describe('noticeProblems', () => {
  it('has nothing to say when the chunk with the list has the notice', () => {
    expect(noticeProblems([{ name: 'a.js', text: NOTICE + LIST }], ENTRIES)).toEqual([])
  })

  it('does not ask for the notice of a chunk without the list', () => {
    const chunks = [
      { name: 'a.js', text: NOTICE + LIST },
      { name: 'b.js', text: 'console.log(1)' },
    ]

    expect(noticeProblems(chunks, ENTRIES)).toEqual([])
  })

  it('names the chunk that has the list and not the notice, once for each thing missing', () => {
    const problems = noticeProblems([{ name: 'a.js', text: LIST }], ENTRIES)

    expect(problems).toHaveLength(REQUIRED_IN_THE_NOTICE.length)
    expect(problems[0]).toContain('a.js carries the list of common passwords but not')
  })

  it('names what is missing when only a part of the notice is there', () => {
    const text = `/*! ${REQUIRED_IN_THE_NOTICE[0]} */${LIST}`

    expect(noticeProblems([{ name: 'a.js', text }], ENTRIES)).toEqual([
      `a.js carries the list of common passwords but not "${REQUIRED_IN_THE_NOTICE[1]}"`,
      `a.js carries the list of common passwords but not "${REQUIRED_IN_THE_NOTICE[2]}"`,
    ])
  })

  it('says so when no chunk has the list (it was dropped, or renamed, or split)', () => {
    expect(noticeProblems([{ name: 'a.js', text: NOTICE }], ENTRIES)).toEqual([
      'no file of the build carries the list of common passwords',
    ])
  })

  it('finds the list in a chunk even if the notice and the list are far apart', () => {
    const text = `${NOTICE}${'x'.repeat(10_000)}${LIST}`

    expect(noticeProblems([{ name: 'a.js', text }], ENTRIES)).toEqual([])
  })

  it('does not take a chunk with a few of the entries for the list', () => {
    const few = ENTRIES.slice(0, 5).join(' ')

    expect(noticeProblems([{ name: 'a.js', text: few }], ENTRIES)).toEqual([
      'no file of the build carries the list of common passwords',
    ])
  })
})
