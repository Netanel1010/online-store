# 0008. Search, filtering and sorting run in the API, on stored normalized text

**Status:** Accepted

## Context

The search, the filters and the sorting are rules the storefront has always had, and the same words,
brands and specifications have to keep giving the same products in the same order. With the catalog in
MongoDB, doing the work in the API means a listing does not need the whole catalog in the browser.

## Decision

- `GET /api/products` takes the search text, category, brands, specification filters, sort and paging
  as query parameters and answers one page, with `total` and `totalPages` that count the matches. With
  `facets=true` it also returns the filter options with the counts each would give.
- **The rules are the storefront's own** (`src/features/products/listing/search.ts`, shared with the
  API, [0004](0004-share-schemas-between-site-and-api.md)): text is normalized (lower case, no accents
  or niqqud, punctuation is a separator), split into at most 8 words, and every word has to match.
- **MongoDB cannot normalize Hebrew text while it searches**, so each product is stored with the
  normalized text of its searchable fields in a `search` object (never returned). A search is one
  pattern per word on it; the typed text is reduced to letters and digits and escaped, so it cannot
  become a pattern of its own. The seed stores the text, and the API backfills it when it starts for
  any product that has none or an older version.
- **Sorting** uses a Hebrew collation in which numbers compare as numbers; every sort ends with `id`,
  so pages never overlap. Without a `sort`, a search lists the best match first, which needs every
  match, so the API reads the matches (only those) and pages them itself.
- **Filter options** come from grouped queries so the counts agree with the results; the label of a
  specification becomes a filter only when filtering by it is useful (`SPEC_FACET_RULES`).
- **No new indexes:** the queries filter on small, bounded values and search with unanchored patterns,
  which no index can serve; the unique `id` index serves the default order and `GET /api/products/:id`.

## Consequences

- The catalog is small (31 products), so the unanchored patterns are cheap. A much larger catalog
  would need a different search strategy; that is a new decision, not a configuration change.
- The API needs permission to write for the backfill and the index at start-up.
- Three layers keep it testable: the query parser, the service over an in-memory repository, and the
  MongoDB filters evaluated on the real catalog without a database; integration tests ask MongoDB and
  the in-memory repository the same questions and expect the same answers.

## In the code

`server/src/products/` (`listQuery.ts`, `service.ts`, `productFilter.ts`, `searchFields.ts`,
`facets.ts`, `repository.ts`), `src/features/products/listing/`, `server/README.md#search-filters-and-sorting`.
