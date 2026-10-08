# Architecture decision records

An ADR records one decision that shapes the system: what was decided, why, and what it costs. Read
them with the [architecture overview](../architecture.md), which shows where each decision lives.

**How these records were made.** They were written in M11, after the decisions had been built, from
what the repository already says about them: the code comments, [`server/README.md`](../../server/README.md),
the [M1–M8 progress record](../production-roadmap-progress.md), the
[M9 record](../m9-server-cart-and-orders.md), [`state-persistence.md`](../state-persistence.md),
[`deployment.md`](../deployment.md) and [`testing.md`](../testing.md). They do not claim to be
minutes of a discussion at the time, and an alternative is listed only where the repository itself
names it. Each record ends with the files that show the decision in the code, which is the part to
trust if a record and the code ever disagree.

| #                                                                      | Decision                                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [0001](0001-static-site-and-separate-api.md)                           | A static site on GitHub Pages and an API on Render, deployed separately                   |
| [0002](0002-bearer-tokens-not-cookies.md)                              | Sessions travel in an `Authorization` header, not in cookies                              |
| [0003](0003-opaque-sessions-and-scrypt.md)                             | Opaque server-side sessions instead of JWT, and passwords hashed with scrypt              |
| [0004](0004-share-schemas-between-site-and-api.md)                     | The site and the API share one set of schemas and rules                                   |
| [0005](0005-orders-priced-and-deduplicated-by-the-api.md)              | The API prices every order, keeps an immutable snapshot and makes a retry harmless        |
| [0006](0006-browser-state-keeps-product-ids-only.md)                   | Cart and favorites in the browser keep product ids, never copies of products              |
| [0007](0007-local-first-cart-mirrored-to-the-account.md)               | The cart lives in the browser and is mirrored to the account                              |
| [0008](0008-search-and-filtering-in-the-api.md)                        | Search, filtering and sorting run in the API, on stored normalized text                   |
| [0009](0009-pages-load-only-what-they-show.md)                         | Pages load only the products they show, and `products.json` is the one source             |
| [0010](0010-in-house-limits-and-headers.md)                            | Rate limits and security headers are written in-house, without extra libraries            |
| [0011](0011-one-workflow-gates-both-deployments.md)                    | One workflow gates both deployments                                                       |
| [0012](0012-tests-run-the-real-api-code.md)                            | Tests run the real API code over in-memory data; MongoDB is tested separately             |

## Writing a new one

Copy the shape of an existing record: **Status**, **Context**, **Decision**, **Consequences**,
**In the code**. Number it with the next free number, add it to the table above, and write it in the
same pull request as the change. A decision that is replaced keeps its record: change its status to
`Superseded by NNNN` and say why in the new one. Keep it to what is true and checkable.
