import {
  ALL_SEARCH_FIELDS,
  CORE_SEARCH_FIELDS,
  MIN_GLUED_LENGTH,
  MIN_SUBSTRING_LENGTH,
  searchTexts,
  searchWords,
  type SearchFieldName,
} from '../../../src/features/products/listing/search.ts'
import type { Product } from './types.ts'

/**
 * How a product is found by a search text.
 *
 * The search (its normalization, the words, where it looks) is the storefront's own, in
 * `src/features/products/listing/search.ts`, which the API shares so that the two cannot drift.
 * MongoDB cannot normalize Hebrew text or ignore punctuation while it searches, so each product is
 * stored with the normalized text of every searchable field, in a `search` object. A search text
 * becomes a plain `find` condition on those fields: one pattern per word.
 */

/**
 * Written with the stored fields. When the way the text is normalized changes, raise it: the API
 * rewrites the products that have an older version when it starts (`ensureSearchFields`).
 */
export const SEARCH_VERSION = 1

export type StoredSearch = { v: number } & Record<SearchFieldName, string>

export function buildSearchFields(product: Product): StoredSearch {
  return { v: SEARCH_VERSION, ...searchTexts(product) }
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The pattern of one word, against a normalized field (lower case, words separated by one space):
 *  - one or two characters: the start of a word, so "i7" finds "i7 13700" but not "wifi7";
 *  - three or more: any part of a word, so "4070" finds "n4070gaming";
 *  - when it is the only word and has four or more characters, spaces between its characters are
 *    allowed too, so "rtx4070" finds "rtx 4070".
 * A pattern never matches across words by accident: a normalized word has no space in it.
 */
function wordPattern(word: string, onlyWord: boolean): string {
  if (word.length < MIN_SUBSTRING_LENGTH) return `(^| )${escapeRegExp(word)}`
  if (onlyWord && word.length >= MIN_GLUED_LENGTH) {
    return [...word].map(escapeRegExp).join(' ?')
  }
  return escapeRegExp(word)
}

/**
 * The condition for products whose stored text matches every word of `query`, each word in at
 * least one field. The core fields are name, SKU, brand and category; `deep` adds the
 * specification values and the feature lines (see the top of search.ts). An empty condition
 * matches everything, as an empty search does.
 *
 * It uses only `$and`, `$or` and `$regex` with escaped text and no wildcards of its own, so a
 * typed text cannot become an expensive or unsafe pattern, and the number of words is capped.
 * Unanchored patterns cannot use an index, which is fine for a catalog of this size.
 */
export function searchFilter(query: string, deep: boolean): Record<string, unknown> {
  const words = searchWords(query)
  if (words.length === 0) return {}
  const fields = deep ? ALL_SEARCH_FIELDS : CORE_SEARCH_FIELDS
  const onlyWord = words.length === 1

  return {
    $and: words.map((word) => ({
      $or: fields.map((field) => ({
        [`search.${field}`]: { $regex: wordPattern(word, onlyWord) },
      })),
    })),
  }
}
