# 0004. The site and the API share one set of schemas and rules

**Status:** Accepted

## Context

Both programs handle the same things: a product, the limits of a cart, the delivery details of an
order, the rules for a password, the words of a search. Written twice, they drift apart, and a form
could accept what the API refuses (or the reverse).

## Decision

The rule is written once, in `src/`, as TypeScript and Zod, and the API imports it from there:

| Shared file                                       | Used for                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `features/products/schema.ts`                     | the product: validates the seed, every stored document read, and what the site receives                   |
| `features/products/brands.ts`, `categories.ts`    | the allowed brand and category ids                                                                        |
| `features/products/listing/query.ts`, `search.ts` | the query parameters of a listing, and the search rules ([0008](0008-search-and-filtering-in-the-api.md)) |
| `features/cart/limits.ts`                         | 1–99 units of a product, 50 different products                                                            |
| `features/checkout/delivery.ts`                   | the delivery details (the form checks them first, the API again)                                          |
| `features/auth/rules.ts`                          | the rules for a name, an email and a password                                                             |

The forms check first only to help the visitor; the API always checks again, because only the API can
be trusted.

## Consequences

- The shared files import with `.ts` extensions and no `@` alias, because the API runs as Node ES
  modules (type stripping in development and tests, `rewriteRelativeImportExtensions` in the build).
- The API's build needs the whole repository: its `rootDir` is the repository root, the output is
  `dist/server/src/server.js` with the shared files beside it in `dist/src/`, and the Render build
  runs `npm ci` at the root.
- A change to a shared file changes both programs, so both test suites run in CI.
- The product schema trims text, so a value with a leading space in `products.json` is served
  trimmed (the catalog drift check reads the file through the same schema for that reason).

## In the code

`server/tsconfig.build.json`, `render.yaml`, `server/src/products/types.ts`,
`server/src/auth/schemas.ts`, `server/src/cart/schemas.ts`, `server/src/orders/schemas.ts`.
