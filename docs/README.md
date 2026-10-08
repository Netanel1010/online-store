# Documentation

Where to find what, by what you are trying to do. The project README is the front door; these pages
are the details.

## Understand the system

| Document                                                             | Read it to…                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`architecture.md`](architecture.md)                                 | see how the site, the API and the database fit together, and how a request travels   |
| [`adr/`](adr/README.md)                                              | know why it is built this way: twelve decision records                              |
| [`openapi.yaml`](openapi.yaml)                                       | use the API: every endpoint, parameter, body, answer and error                      |
| [`../server/README.md`](../server/README.md)                         | understand the API's behaviour: search, sessions, cart, orders, limits, configuration |
| [`state-persistence.md`](state-persistence.md)                       | understand the cart and favorites in the browser, and how the cart syncs with the account |
| [`seo.md`](seo.md)                                                   | understand the static pages, the sitemap and the page metadata                      |
| [`product-data-migration.md`](product-data-migration.md)             | see how the catalog data was shaped and corrected                                   |

## Work on it

| Document                                                             | Read it to…                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`development.md`](development.md)                                   | set up, find your way around, and do the common tasks                               |
| [`testing.md`](testing.md)                                           | know what each test layer covers and how CI runs them                               |
| [`accessibility.md`](accessibility.md)                               | see what is checked for accessibility, by machine and by hand, and what is not      |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md)                           | open a pull request the way the project expects                                     |

## Run it

| Document                                                             | Read it to…                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`deployment.md`](deployment.md)                                     | see how Render, Atlas and GitHub Pages are configured, and the symptom table        |
| [`runbook.md`](runbook.md)                                           | release, verify, roll back and handle incidents                                     |

## History

These records say what was done and how it was verified at the time. They are kept as written; the
documents above describe the system as it is now.

| Document                                                                         | Covers                                          |
| -------------------------------------------------------------------------------- | ----------------------------------------------- |
| [`production-roadmap-progress.md`](production-roadmap-progress.md)               | M1–M8: hardening, observability, CI, sessions    |
| [`production-roadmap-m1-m8-report.md`](production-roadmap-m1-m8-report.md)       | the final report of M1–M8                       |
| [`m9-server-cart-and-orders.md`](m9-server-cart-and-orders.md)                   | M9: the server cart and orders                  |
