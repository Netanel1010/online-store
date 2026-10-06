// The extensions are required because the API (server/) imports this file as well, and Node's ES
// modules do not resolve extensionless imports. The app and its tests are not affected.
import { BRANDS } from '../brands.ts'
import { findCategory } from '../categories.ts'
import type { Product } from '../schema.ts'

/* ---------------------------------------------------------------------------------------------
 * Product search. The API runs it for the search and listing pages (its stored search text is built
 * by `searchTexts` below, its patterns follow the rules here, and it ranks with `rankBySearch`);
 * the storefront runs it locally, over the loaded catalog, for the suggestions under the search box.
 *
 * How a query is understood
 *  - Text is normalized the same way for the query and for the products: lower case, no accents or
 *    niqqud, and every run of punctuation or symbols (hyphen, slash, brackets, quotes, ...) is just a
 *    word separator. "GV-N4070GAMING", "gv n4070 gaming" and "(gv)N4070Gaming" read the same.
 *  - The query is split into words and every word has to match the product (AND), in any field.
 *  - A word matches a field when it is a whole word of it, the start of a word, or (from 3
 *    characters on) any part of one, so "4070" finds "N4070GAMING" and "x3d" finds "7800X3D". Two
 *    character words only match the start of a word: "i7" finds "i7-13700" but not "WiFi7".
 *  - A single word of 4+ characters also matches across a space in the product text, so "rtx4070"
 *    finds "RTX 4070".
 *
 * Where it looks, in two steps:
 *  1. The core fields: name, SKU, brand and category. This is what a shopper usually means, and it
 *     keeps a brand search to that brand's products ("intel" does not list every board that merely
 *     supports Intel sockets).
 *  2. Only when nothing matches there, the values of the specifications and the feature lines too,
 *     so "ddr5" or "geforce rtx 4070" still find products whose title does not say so.
 *     Specification labels are never searched (they are the same on every product of a category).
 *
 * Ranking: each word scores by how exactly and where it matched. Results are ordered by the sum,
 * so a product named "RTX 4070" comes before one that only mentions 4070 in its specifications.
 * ------------------------------------------------------------------------------------------- */

const MAX_WORDS = 8
/** From this length on a word may match inside another word. */
export const MIN_SUBSTRING_LENGTH = 3
/** From this length on a single word is also tried against the text with its spaces removed. */
export const MIN_GLUED_LENGTH = 4

const FIELD_WEIGHTS = {
  name: 6,
  sku: 5,
  brand: 4,
  category: 3,
  specs: 2,
  features: 1,
} as const

export type SearchFieldName = keyof typeof FIELD_WEIGHTS

/** The fields a first search looks at (see the top of this file). */
export const CORE_SEARCH_FIELDS: readonly SearchFieldName[] = ['name', 'sku', 'brand', 'category']
/** Every field, which a search falls back to when the core fields match nothing. */
export const ALL_SEARCH_FIELDS = Object.keys(FIELD_WEIGHTS) as SearchFieldName[]

/** Lower case, no diacritics, and every run of punctuation or symbols replaced by one space. */
export function normalizeSearchText(text: string): string {
  return text
    .replace(/[™®©℠]/gu, '') // trademark signs would otherwise become the letters "tm" below
    .normalize('NFKD')
    .toLocaleLowerCase('he')
    .replace(/\p{M}+/gu, '') // accents and Hebrew niqqud
    .replace(/["'`´’‘“”״׳]+/gu, '') // quotes and geresh: מק"ט -> מקט, don't -> dont
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** The words of a query, normalized, without repeats and capped, so a long query stays cheap. */
export function searchWords(query: string): string[] {
  const words = normalizeSearchText(query).split(' ').filter(Boolean)
  return [...new Set(words)].slice(0, MAX_WORDS)
}

interface SearchField {
  /** Normalized text. */
  text: string
  words: readonly string[]
  /** The text without its spaces. */
  glued: string
}

type SearchDocument = Record<SearchFieldName, SearchField>

function field(...parts: string[]): SearchField {
  const text = normalizeSearchText(parts.join(' '))
  return { text, words: text.split(' ').filter(Boolean), glued: text.replaceAll(' ', '') }
}

/**
 * The normalized text of each searchable field of a product. The API stores these with the product
 * so that MongoDB can search them, and the search in this file builds its documents from the same
 * function, so both read a product the same way.
 */
export function searchTexts(product: Product): Record<SearchFieldName, string> {
  const texts = (parts: string[]) => normalizeSearchText(parts.join(' '))
  return {
    name: texts([product.name, product.fullName]),
    sku: texts([product.id]),
    brand: texts([BRANDS[product.brand].name, product.brand]),
    category: texts([findCategory(product.category)?.label ?? '', product.category]),
    specs: texts(product.specs.map((spec) => spec.value)),
    features: texts(product.features),
  }
}

const documents = new WeakMap<Product, SearchDocument>()

function documentOf(product: Product): SearchDocument {
  let document = documents.get(product)
  if (!document) {
    const texts = searchTexts(product)
    document = {
      name: field(texts.name),
      sku: field(texts.sku),
      brand: field(texts.brand),
      category: field(texts.category),
      specs: field(texts.specs),
      features: field(texts.features),
    }
    documents.set(product, document)
  }
  return document
}

/** 0 (no match), 1 (inside a word), 2 (start of a word) or 3 (a whole word). */
function matchLevel(word: string, target: SearchField, allowGlued: boolean): number {
  let level = 0
  for (const candidate of target.words) {
    if (candidate === word) return 3
    if (candidate.startsWith(word)) level = 2
    else if (level === 0 && word.length >= MIN_SUBSTRING_LENGTH && candidate.includes(word)) {
      level = 1
    }
  }
  if (level === 0 && allowGlued && target.glued.includes(word)) level = 1
  return level
}

function wordScore(
  word: string,
  document: SearchDocument,
  fields: readonly SearchFieldName[],
  allowGlued: boolean,
): number {
  let best = 0
  for (const name of fields) {
    const level = matchLevel(word, document[name], allowGlued)
    best = Math.max(best, level * FIELD_WEIGHTS[name])
  }
  return best
}

/**
 * 0 when the product does not match the query; the higher, the better the match. `deep` also
 * looks at specification values and feature lines (see the top of this file).
 */
export function searchScore(product: Product, query: string, { deep = false } = {}): number {
  const words = searchWords(query)
  if (words.length === 0) return 1
  const document = documentOf(product)
  const allowGlued = words.length === 1 && (words[0]?.length ?? 0) >= MIN_GLUED_LENGTH
  const fields = deep ? ALL_SEARCH_FIELDS : CORE_SEARCH_FIELDS

  let total = 0
  for (const word of words) {
    const score = wordScore(word, document, fields, allowGlued)
    if (score === 0) return 0
    total += score
  }
  // Words that appear together, in order, in the name are a better match than scattered ones.
  if (words.length > 1 && document.name.text.includes(words.join(' '))) {
    total += FIELD_WEIGHTS.name * 3
  }
  return total
}

/** Whether the product matches in its core fields (name, SKU, brand, category). */
export function matchesSearch(product: Product, query: string): boolean {
  return searchScore(product, query) > 0
}

/**
 * The products that match the query: those matching in their core fields or, when there are
 * none, those matching anywhere. `null` means the query is empty and everything matches.
 */
export function searchMatches(products: readonly Product[], query: string): Set<Product> | null {
  if (searchWords(query).length === 0) return null
  const core = products.filter((product) => searchScore(product, query) > 0)
  if (core.length > 0) return new Set(core)
  return new Set(products.filter((product) => searchScore(product, query, { deep: true }) > 0))
}

/** Best matches first. Products that match equally keep their order. */
export function rankBySearch(products: readonly Product[], query: string): Product[] {
  return products
    .map((product, index) => ({
      product,
      index,
      score: searchScore(product, query, { deep: true }),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ product }) => product)
}

/** Suggestions are not offered for a single character: it would match nearly everything. */
export const MIN_SUGGESTION_LENGTH = 2

/**
 * The best matches for what is being typed, for a list of suggestions. It is the same search as
 * the results page (`searchMatches` and `rankBySearch`), cut short, so a suggestion is always a
 * product the results page would list too, in the same order.
 */
export function suggestProducts(products: readonly Product[], query: string, limit = 5): Product[] {
  if (searchWords(query).join('').length < MIN_SUGGESTION_LENGTH) return []
  const found = searchMatches(products, query)
  if (found === null) return []
  return rankBySearch(
    products.filter((product) => found.has(product)),
    query,
  ).slice(0, limit)
}
