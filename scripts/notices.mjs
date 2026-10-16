// What scripts/check-notices.mjs is made of, apart from the disk, so that it can be tested.

/** What the notice of the list of common passwords has to say in the build (see THIRD_PARTY_NOTICES.md). */
export const REQUIRED_IN_THE_NOTICE = [
  'Mark Burnett (xato.net)',
  'https://creativecommons.org/licenses/by-sa/3.0/',
  'Creative Commons Attribution-ShareAlike 3.0 Unported',
]

/** A chunk carries the list if it has nearly all of its entries (any other code has a few of them). */
const CARRIES = 0.9

/**
 * Why the build does not carry the notice of the list with the list. The list is under a licence that
 * asks for the author to be credited and for the licence to go with every copy, so a chunk that has the
 * list has to have the notice too. A minifier drops comments, and this is what notices that it did.
 *
 * @param {{ name: string; text: string }[]} chunks the JavaScript files of the build
 * @param {readonly string[]} entries the list of common passwords
 * @returns {string[]} the problems, none when the build is right
 */
export function noticeProblems(chunks, entries) {
  const carrying = chunks.filter(
    ({ text }) =>
      entries.filter((entry) => text.includes(entry)).length >= entries.length * CARRIES,
  )
  if (carrying.length === 0) return ['no file of the build carries the list of common passwords']
  return carrying.flatMap(({ name, text }) =>
    REQUIRED_IN_THE_NOTICE.filter((required) => !text.includes(required)).map(
      (required) => `${name} carries the list of common passwords but not "${required}"`,
    ),
  )
}
