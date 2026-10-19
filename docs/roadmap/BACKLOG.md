# Customer experience backlog

**Status: proposed, waiting for the owner's approval.** Nothing in this file is implemented. It is the
source of truth for the customer-experience program: an item is changed here first, and a batch is
started only after the owner approves it.

|               |                                                                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Written       | 2026-10-19, from a read-only discovery; nothing in the application was changed                                                                                                                                                    |
| Revised       | 2026-10-19, after a critical review and the owner's decisions (see [Revision notes](#revision-notes)). No new inspection of the site was made; the review re-read how `SORT_KEYS` is used and what `scripts/check-api.mjs` checks |
| Baseline      | The discovery was done on `main` at `c8de10a` (merge of PR #89). `main` is now at `4a45b38`, after PR #92 (the accessible-name fix of the cart controls), PR #90 (npm updates) and PR #91 (CodeQL action updates)                 |
| Inspected     | The source, the tests and the documents named in each item; the deployed GitHub Pages site on a 1440 px and a 375 px viewport of the in-app browser; the GitHub Actions and Releases pages                                        |
| Not inspected | See [What remains unverified](#what-remains-unverified)                                                                                                                                                                           |

## How to read it

Every finding carries one label and the evidence behind it. A label is never stronger than what was
checked.

| Label                | Meaning                                                         |
| -------------------- | --------------------------------------------------------------- |
| **VERIFIED PRESENT** | It exists, and the source or the deployed site shows it         |
| **PARTIAL**          | Part of it exists; the item says which part and what is missing |
| **MISSING**          | It does not exist: no code, and nothing on the deployed site    |
| **UNVERIFIED**       | It could not be checked here; the item says why                 |

**Evidence** is a file (`path:line`), a test, or an observation. An observation says where it was made:
"live" is the deployed site at <https://netanel1010.github.io/online-store/>, in the in-app browser of
the session, at 1440 px or at 375 px. A viewport of the in-app browser is not a phone, and no real
device was used. "No test was found" means a search did not find one; it is not proof that none exists.
A behavior that a document or a test says was checked is described as documented or tested; it was not
re-run here.

**Priority** weighs four things together: how many visitors it helps and how much, how much work it
is, how likely it is to break something that works, and what it depends on.

| Priority | Means                                                                   |
| -------- | ----------------------------------------------------------------------- |
| **P1**   | Large benefit for the effort, or a foundation that other items stand on |
| **P2**   | Clear benefit, but larger, riskier or dependent on a decision           |
| **P3**   | Worth doing once the rest is done                                       |

Priority is not the order of work. The order follows dependencies and risk, and is in
[Batches and order](#batches-and-order). Batch numbers (B1 to B10) are names; the **Order** column says
when each one runs.

## Decisions already made

| Area                | Decision                                                                                                                                                                        | Item                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Eilat pricing       | Keep it. Do not remove or replace it                                                                                                                                            | all                 |
| Sorting             | Add sorting by the existing `isRecommended` field and nothing else: no biggest-discount sort, no popularity or "best selling"                                                   | CX-02               |
| Contact page        | Human, welcoming, professional, with a short FAQ. No claim of real support, no real contact form                                                                                | CX-11               |
| Search              | Desktop field 520 px wide (from 448 px), still responsive on smaller screens. The live suggestions already exist and are not rebuilt                                            | CX-03               |
| Accessibility       | Improve it throughout, plus a small display-preferences panel whose options really work. Two stages: a baseline now and a deeper review after the sign-in and checkout changes  | CX-06, CX-14, CX-07 |
| Screen readers      | Planned and run by a written protocol. If a tool is hard to use, practical alternatives are tried first. A check is never reported as passed without a record of it             | CX-06               |
| Animations          | One restrained approach, feedback for add to cart, favorites and checkout, `prefers-reduced-motion` honored                                                                     | CX-05               |
| Home hero           | Better layout, heading, text, call to action and responsive behavior. This program adds, replaces or removes no image asset                                                     | CX-08               |
| Back to top         | A button after a meaningful scroll, reduced-motion aware                                                                                                                        | CX-04               |
| Brand links         | The brands on the home page link to the catalog filtered by that brand                                                                                                          | CX-01               |
| Footer              | Redesign with useful navigation and factual information. No invented guarantees or support                                                                                      | CX-09               |
| Sign-up and sign-in | Especially welcoming, without weakening authentication, the password policy or any security control                                                                             | CX-12               |
| Checkout            | Clear and reassuring. Duplicate demo notices are reduced, while a clear demo disclosure and everything a visitor needs to know before confirming stay. Copy tests are respected | CX-13               |
| About page          | Rebuilt around the real story of the project. No invented customers, not presented as a business                                                                                | CX-10               |
| README metrics      | Updated only at the end of the program, from fresh, verified measurements                                                                                                       | Rule 7              |
| Project books       | Not updated during this program                                                                                                                                                 | Rule 8              |
| Deferred            | PWA, PC Builder, product videos, promotions and discounts. See [Deferred](#deferred-and-not-proposed)                                                                           | none                |

**Eilat price, what was checked.** A search of the non-test `.ts` and `.tsx` files of `src/` found it
only in the product page (`ProductDetails.tsx:61`, "מחיר באילת") and in the product schema
(`schema.ts:16`); a search of the non-test files of `server/src` found no mention of it, and the API
prices an order by `price.current` (`server/src/orders/service.ts:261`). Not inspected: `scripts/`
(which builds the static pages), `public/data/products.json` beyond the fields read, and any output
that reaches search engines. Nothing in this program touches the Eilat price.

## Where things stand

An index only. The evidence for each row is in the item named in the last column.

| Area                          | Status               | Item                                                                                                      |
| ----------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| Live search suggestions       | **VERIFIED PRESENT** | [CX-03](#cx-03-a-larger-desktop-search-field)                                                             |
| Listing filters and URL state | **VERIFIED PRESENT** | [CX-01](#cx-01-brand-links-on-the-home-page)                                                              |
| Sorting                       | **PARTIAL**          | [CX-02](#cx-02-sort-by-recommended)                                                                       |
| Brand strip on the home page  | **PARTIAL**          | CX-01                                                                                                     |
| Back to top                   | **MISSING**          | [CX-04](#cx-04-back-to-top)                                                                               |
| Motion and feedback           | **PARTIAL**          | [CX-05](#cx-05-a-restrained-motion-approach-with-feedback)                                                |
| Accessibility                 | **PARTIAL**          | [CX-06](#cx-06-accessibility-baseline), [CX-14](#cx-14-accessibility-final-review-and-screen-reader-pass) |
| Display preferences           | **MISSING**          | [CX-07](#cx-07-display-preferences-panel)                                                                 |
| Hero                          | **PARTIAL**          | [CX-08](#cx-08-a-better-home-hero)                                                                        |
| Footer                        | **PARTIAL**          | [CX-09](#cx-09-footer-redesign)                                                                           |
| About page                    | **PARTIAL**          | [CX-10](#cx-10-about-page-rebuilt-around-the-real-story)                                                  |
| Contact page                  | **PARTIAL**          | [CX-11](#cx-11-a-human-contact-page-with-a-short-faq)                                                     |
| Sign-in and registration      | **PARTIAL**          | [CX-12](#cx-12-a-welcoming-sign-up-and-sign-in)                                                           |
| Checkout                      | **PARTIAL**          | [CX-13](#cx-13-a-clear-and-reassuring-checkout)                                                           |
| First-page weight             | **VERIFIED PRESENT** | [Budget ledger](#budget-ledger)                                                                           |

## Rules for every item

These are not repeated in each item, and an item is not done while one of them is broken.

1. **Keep the gates.** CI (`format:check`, lint, typecheck, site tests, API tests, build,
   `check:bundle`, `build:server`, `integration`, `e2e`), the security workflow and the Lighthouse
   thresholds stay as they are (`lighthouserc.json`: accessibility 0.95, best practices 0.9, SEO 0.9,
   layout shift 0.25, performance warns under 0.6). No budget is raised and no test is removed to
   make a change pass. A test that pins behavior this program changes on purpose is replaced by one
   that pins the new behavior at least as strictly, and the pull request says which.
2. **Budgets.** The first page has little room (see the [Budget ledger](#budget-ledger)). Anything that
   is not needed on the first screen loads on demand, as the form and information pages already do.
3. **CSP.** Pages carry `script-src 'self'` and `style-src 'self'` (`dist/index.html`). No inline
   script, no `<style>` element and no inline `style` attribute. Setting a class or a `data-` attribute
   from the app, and styling by the stylesheet, is allowed. `npm run check:csp` and `e2e/csp.spec.ts`
   stay green.
4. **RTL and phones.** Logical properties (`start`, `end`, `ps`, `me`). A new or changed control is
   checked in a right-to-left layout, at 320, 375 and 1440 px, and a value that is always left to right
   (an email, a price in digits) says so with `dir`.
5. **Words.** The store is a demo with no payment, support, shipping or warranty of its own. No new
   text promises any of them. All new Hebrew text is written for approval first, as in the earlier
   phases, and nothing is merged with wording the owner has not seen. Text that existing tests pin
   (`demoOrderCopy.test.tsx`, the notice tests of sign-in and checkout) changes only through the
   replacement rule of Rule 1.
6. **Do not weaken security.** Nothing here changes the password policy, the rate limits, the
   sessions, the CSP, the idempotency of orders or the server pricing.
7. **Each item updates what it makes untrue.** The documents that describe a behavior change with it
   (`docs/accessibility.md` and `/accessibility`, `docs/state-persistence.md` and `/privacy` for a new
   stored value, `docs/openapi.yaml` for an API change, `docs/testing.md` for new suites). The README
   metrics (test counts and the like) are changed only at the end of the program, in one pull request,
   from measurements taken then.
8. **Delivery.** One batch is one branch and one pull request, in English, from the latest `main`
   (item CX-02 is the one exception: two pull requests). The owner pushes, opens and merges. The first
   of them adds this file to `docs/README.md`. The two project books are not touched by this program;
   a summary document for GitHub Releases is prepared once, at the end.
9. **Evidence.** A pull request says what was run and what it returned, and lists a check that was not
   run as not run. A manual or assistive-technology check is claimed only if a record of it exists
   (see the [protocol in CX-06](#assistive-technology-protocol)).
10. **Done.** An item is done when its acceptance criteria are met, its automated tests are added and
    green, its manual checks are recorded in the pull request, the measurements of Rules 2 to 4 hold,
    the documents of Rule 7 are true, and any new Hebrew text was approved. An item states below only
    what it adds to this.

## Budget ledger

The first page loads what `index.html` asks for up front; the lazy pages (sign-in, registration,
checkout, orders, information pages) do not count (`scripts/bundleBudget.mjs`).

|                                                                                  | JavaScript (gzip) | CSS (gzip) |
| -------------------------------------------------------------------------------- | ----------------- | ---------- |
| Limit (never changes)                                                            | 160 KiB           | 16 KiB     |
| Measured by `npm run check:bundle` on a fresh local build of `main` at `4a45b38` | 138.9 KiB         | 7.9 KiB    |
| Room left at that measurement                                                    | 21.1 KiB          | 8.1 KiB    |

The starting point above is a local build on Windows; the `check:bundle` step of CI is the one that
gates a pull request. These ceilings are proposed limits for each item's share of the room, not
predictions or measurements. A
pull request reports `check:bundle` before and after; one that needs more than its ceiling says so,
with the numbers, before it is merged, and the owner decides. The unallocated room is a reserve for
what nobody foresaw.

| Item                                                              | JS ceiling   | CSS ceiling |
| ----------------------------------------------------------------- | ------------ | ----------- |
| CX-01 brand links                                                 | 0.3 KiB      | 0.1 KiB     |
| CX-02 (b) the select option                                       | 0.1 KiB      | 0           |
| CX-03 search field                                                | 0.1 KiB      | 0.1 KiB     |
| CX-04 back to top                                                 | 1.0 KiB      | 0.3 KiB     |
| CX-05 motion, feedback, busy state                                | 3.0 KiB      | 1.0 KiB     |
| CX-07 preferences (button, store, early apply; the panel is lazy) | 2.0 KiB      | 1.5 KiB     |
| CX-08 hero                                                        | 1.5 KiB      | 1.0 KiB     |
| CX-09 footer (it is on every page, so it is in the first page)    | 1.5 KiB      | 0.8 KiB     |
| **Allocated**                                                     | **9.5 KiB**  | **4.8 KiB** |
| **Reserve**                                                       | **11.6 KiB** | **3.3 KiB** |

Progress is recorded in this table as each batch lands (an "actual" column added by the pull request
that spends the room).

## Batches and order

| Order | Batch                          | Items               | Why here                                                                                                                                                                     | Risk   |
| ----- | ------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1     | B1 Browsing quick wins         | CX-01, CX-03        | Small, visible, independent. CX-01 also gives the footer a helper to reuse                                                                                                   | Low    |
| 2     | B2 Recommended sort            | CX-02               | The only API change, so it stands alone, in two pull requests. Its first pull request has no dependency and can be open beside B1: the two touch different files (see CX-01) | Medium |
| 3     | B3 Motion and feedback         | CX-05, CX-04        | One approach and one reduced-motion hook before anything else animates; the busy-state pattern that sign-in and checkout need. Back to top is its first user                 | Low    |
| 4     | B4 Accessibility baseline      | CX-06               | A bounded audit of the shell and of the pages the program does not rebuild, the fixes of the shared pieces, and the one form-error behavior that B8 and B9 apply             | Medium |
| 5     | B6 Content pages               | CX-09, CX-11, CX-10 | The footer is on every page, so it is rebuilt before later checks. Text and layout only, no logic. It waits only for the owner's wording                                     | Low    |
| 6     | B7 Home hero                   | CX-08               | Home page layout. Needs the motion hook of B3. Placed after the content pages so the home page is checked once, in its final form                                            | Medium |
| 7     | B8 Sign-up and sign-in         | CX-12               | Authentication code, so it stands alone. It needs the busy state (B3) and the field fixes and form-error behavior (B4)                                                       | High   |
| 8     | B9 Checkout                    | CX-13               | The riskiest page, last of the page rebuilds. It needs the same inputs as B8 and the field changes B8 makes. Presentation only                                               | High   |
| 9     | B5 Display preferences         | CX-07               | A global effect, so it runs after the pages are final and each option is checked once on the finished pages. It needs B3 (the motion switch) and B4 (the zoom results)       | Medium |
| 10    | B10 Accessibility final review | CX-14               | Deeper review and screen-reader pass of the finished flows, after B8, B9 and B5. It is also the evidence for the final summary document                                      | Low    |

B8 and B9 each need a full review with the engineering gates (understand, pre-mortem, small steps,
adversarial self-review, evidence only) and the browser and assistive-technology checks listed in the
item. B6 only needs the owner's wording, so it can run beside B4.

## Items

### CX-01 Brand links on the home page

**Priority** P1: small change, clear value, no risk to data. **Batch** B1.

**Current state.** **PARTIAL.** `BrandStrip.tsx` renders seven logos as images with the brand name as
the alt text, and its comment says they are not links because there is no brand page. Live (1440 px): the
strip holds no links. The filter they should lead to exists and works: `?brand=<id>` is parsed and
written by `query.ts`, and live `/products/?brand=asus` showed the one ASUS product with the filter
checked. Catalog size per brand (`public/data/products.json`): Gigabyte 9, Intel 9, Corsair 7, AMD 2,
Cooler Master 2, ASUS 1, Samsung 1.

**User problem and outcome.** A visitor sees a brand they want and cannot click it. The logo becomes
the way into that brand's products, using the listing that already exists.

**Acceptance criteria**

1. Each of the seven logos is one link to the listing URL for that brand, produced with
   `serializeListingState` on `paths.products`, not written by hand, so it is the URL the filters write.
2. **Accessible name.** The link has `aria-label="מוצרי {brand name}"` (wording to be approved), and the
   logo inside it has `alt=""`. The brand is therefore announced once, and says where the link goes.
3. The target page shows that brand's products with the brand filter checked and its chip.
4. Hover and active states keep the current look (grayscale to color); focus adds a visible ring.
5. A brand with one product (ASUS, Samsung) opens a listing of one product with no error and no empty state.
6. The strip does not scroll sideways at 320 px, and each link is at least 24 by 24 px (the logos are
   40 px high).

**Tests.** A unit test that every brand links to the URL the listing writes and has the name above; an
e2e test that a click lands on the filtered listing and shows the chip; any existing test that finds a
logo by its alt text is changed to find the link by its name, with the same strictness; the existing
home and axe tests stay. **Manual.** Keyboard walk through the strip (the Tab order follows the visual
order in RTL); 375 and 1440 px.

**Depends on / affects.** Nothing. `BrandStrip.tsx`, and a shared helper for a brand's listing path (in
a new file rather than in `query.ts` or `brands.ts`, which avoids a circular import and a clash with CX-02),
reused by CX-09. **Risks.** A new link must not change how focus moves on navigation
(`useFocusAtPageStart` already handles links). Two brands have one product: that is the catalog, not a
defect, and is not hidden.

### CX-02 Sort by recommended

**Priority** P1: cheap for the value, but the only API change in the program. **Batch** B2, as two pull
requests.

**Current state.** **MISSING** as a sort, **VERIFIED PRESENT** as data. `SORT_KEYS`
(`src/features/products/listing/query.ts:20`) is the single list of sort keys for the site and the API.
Three places depend on it, which is why the rollout needs care:

- the API validates with `z.enum(SORT_KEYS)` (`server/src/products/listQuery.ts:71`) and maps a key to
  a MongoDB order in `toMongoSort` (`productFilter.ts:49`), which falls back to the order by `id` for a
  key it has no case for; the in-memory repository used by the API tests and the e2e stub has its own
  copy of the comparison (`server/src/testing/memoryProductRepository.ts:29`);
- the site reads the sort from the URL with `isSortKey`, built on `SORT_KEYS` (`query.ts:46`);
- `SortSelect.tsx` renders one option per `SORT_KEYS` entry, with `LABELS: Record<SortKey, string>`.

So adding a key to `SORT_KEYS` makes the API accept it and the site offer it at the same moment. The
documented enum is in `docs/openapi.yaml:168`. `isRecommended` is an editorial flag in
`schema.ts:37`, set on 7 of the 31 products in `public/data/products.json`.

**User problem and outcome.** There is no way to see the store's own picks first. A new order,
"מומלצים קודם" (working label, needs approval), lists the products with `isRecommended` first. It is
called what it is: a recommendation by the store, not popularity, not sales and not discount.

**Design: accepted keys and visible options are two lists.**

- `SORT_KEYS` stays the list of keys the API accepts, and gains `recommended`.
- A new `VISIBLE_SORT_KEYS`, written out as an explicit list (not computed by subtraction), is the list
  of keys the site offers and reads from the URL. In pull request (a) it lacks `recommended`.
- `SortSelect.tsx` renders `VISIBLE_SORT_KEYS`; its `LABELS` is keyed by the visible type, so adding a
  key to the visible list without a label does not type-check.
- `parseListingState` validates the URL against `VISIBLE_SORT_KEYS`. In (a) a URL with
  `?sort=recommended` is treated like any unknown value (the default order), so neither the select nor
  the address bar can make the site send the key.
- `toMongoSort` and the in-memory comparison get an explicit `recommended` case: `isRecommended`
  descending, then name, then `id` (the shape of the price sorts, with the same name collation), so
  paging never repeats or skips a product.

**Pull requests**

- **(a) The API accepts it; the site does not offer it.** The shared lists, `toMongoSort` and the
  in-memory comparison, `docs/openapi.yaml` and `server/README.md`, and their tests. The site does not
  change: no new option and no new URL behavior. It type-checks because `LABELS` is keyed by the visible
  type and the `toMongoSort` switch handles the new key.
- **(b) The site offers it.** `recommended` joins `VISIBLE_SORT_KEYS` with its label; the e2e test; the
  `check:api` extension below; a short note in `docs/runbook.md` on the order of rollout and rollback.
  Opened only after (a) is live and verified.

**Acceptance criteria**

1. After (a): `GET /api/products?sort=recommended&limit=100` answers 200; every product with
   `isRecommended: true` comes before every product with `false`; each of the two blocks is in the same
   order as the same products under `sort=name-asc` (the existing, tested order, with its tie-break by
   `id`); no product is lost or repeated; `sort=default` and every existing order are unchanged; an
   unknown value is still rejected.
2. It works together with search, category, brand and specification filters and with paging.
3. After (a) the site is observably unchanged: the select lists the same five options and
   `?sort=recommended` shows the default order.
4. After (b): the select offers the new option; choosing it writes `sort=recommended` to the URL, and
   reload, sharing and back and forward reproduce it; the default stays clean (no parameter). Search
   keeps its own default label "התאמה לחיפוש".
5. No label, text or document calls it popular, best selling or best value.
6. `docs/openapi.yaml` lists the value, and the OpenAPI contract test compares the document with
   `SORT_KEYS` (the accepted list), while a new test asserts that every visible key is accepted and that
   the select renders exactly the visible keys.

**`check:api`: extended in (b), and why.** The deploy job runs `scripts/check-api.mjs` against the
production API before it publishes the site to GitHub Pages (README, "CI/CD"). Today the script does not
request any sort (it lists products and checks CORS and paging). Adding one request to it in (b) turns a
risk into a gate: if (b) is merged before the API accepts the key, the check fails and Pages is not
published. The check is `GET /api/products?sort=recommended&limit=100`: status 200, the products
partitioned by `isRecommended` as in criterion 1, and the same set of ids as the default order. It does
not check names or counts, so it does not depend on which products are recommended. It is not added in
(a), because (a)'s own deploy would run it against the API before Render has deployed (a). The gate
covers GitHub Pages only: Netlify builds from `main` by itself and does not wait for the workflow, and
the API deploys separately. The sequence therefore stays the primary control: (b) is opened only after
the manual check below.

**Verification before (b) is opened.** Request the production endpoint and apply the partition and
`name-asc` comparison of criterion 1; confirm the recommended block holds exactly the products flagged
in `public/data/products.json` (the count is read from the file); confirm an unknown `sort` value is
still refused. The integration test (below) proves the same relation against a real MongoDB.

**Rollout and rollback.** The site and the API deploy independently, on separate hosts.

- Before (b): the site never sends the key, so (a) can be rolled back or left as it is without effect.
- After (b): the API must not be rolled back to a version without the key while the site offers it, or a
  visitor who picks the option (or opens a shared URL with it) is refused by the API. Roll back in this
  order: revert (b) on both site hosts (a one-line change to `VISIBLE_SORT_KEYS`), then the API if
  needed. Reverting (b) alone is safe at any time.
- A tab that still runs an older site never sends the key, so existing visitors are not affected at any
  step. What the listing shows on a `400` from the API was not inspected; the sequence is designed so
  that the answer is never asked for.

**Tests.** `toMongoSort` and the in-memory comparison agree, including a test that every key of
`SORT_KEYS` other than `default` has its own order (so a missing case cannot silently fall back to the
order by `id`); a route test with filters and paging; the OpenAPI contract test; an integration test
against a real MongoDB for the order and for stable paging; the unit test of the select and of the URL
parsing (in (a) the new value is ignored, in (b) it is read); an e2e test in (b) that the recommended
products come first, the URL carries the choice and a reload keeps it; the `check:api` script test if
the script has one. **Manual.** The production request above; keyboard use of the select.

**Depends on / affects.** `query.ts`, `productFilter.ts`, `memoryProductRepository.ts`, `listQuery`
tests, `openapi.yaml`, `server/README.md` (sort list), `SortSelect.tsx`, `scripts/check-api.mjs`,
`docs/runbook.md`. **Risks.** The in-memory comparison drifting from MongoDB (the integration test
covers it); the name tie-break and its collation (reused from the price sorts); the deployment window,
closed by the sequence above.

### CX-03 A larger desktop search field

**Priority** P2: small and safe, modest impact. **Batch** B1.

**Current state.** **PARTIAL.** The suggestions the owner described already exist and are not rebuilt:
`SearchForm.tsx` and `useProductSuggestions.ts` list up to five products as the visitor types, each with
a picture, name, brand and category, and price, with a last row that opens all the results. Live
(1440 px): typing "gigabyte" listed five products with exactly these parts and the row "הצגת כל התוצאות
עבור" (the first answer took a few seconds on the sleeping API). Tested: `e2e/search-suggestions.spec.ts`
(typing, the limit of five, keyboard, the all-results row, axe on the open list) and
`SearchForm.test.tsx`; the keyboard and announcement behavior is documented in `docs/accessibility.md`
(the M12 manual pass; not re-run here). What is left is size: the desktop form is `max-w-md` in
`Header.tsx` (live at 1440 px: the form is 448 px wide, the input 402 px), and the suggestion pictures
are 40 px (`size-10`).

**User problem and outcome.** The search box is the main way to find a part and it is small on a wide
screen. It grows to 520 px, and the suggestion pictures become easier to see, without rebuilding
anything.

**Acceptance criteria**

1. The maximum width of the desktop form becomes 520 px (from 448 px). It still shrinks with the header
   as it does today: at 1440 and 1920 px it measures 520 px (± 2), and at 768, 1024, 1279, 1280 and
   1366 px it is never narrower than it is today at the same width (the pull request records the
   measurements before and after).
2. The header does not overflow at those widths, signed in and signed out (the existing test of
   `e2e/responsive.spec.ts`, "fits, and leaves the search box usable").
3. The suggestion list is as wide as the form, and its pictures are 48 px. The name, brand and
   category, price and the all-results row are unchanged.
4. No change to the suggestion logic, the request timing, the keyboard behavior or the roles.
5. The phone layout (the search inside the menu, the shortcut button from 360 px) is unchanged.
6. The visible focus outline still goes around the whole control.

**Tests.** The existing `e2e/search-suggestions.spec.ts`, `e2e/responsive.spec.ts` and
`e2e/accessibility.spec.ts` stay unchanged and green; a width assertion at 1440 px is added.
**Manual.** The widths above; a long product name in the list.

**Depends on / affects.** `Header.tsx`, `SearchForm.tsx` (classes only). **Risks.** The header
overflowing at 1024 px (the width test is the guard); the header button of CX-07 needs the room this
takes, so CX-07 is measured against the result.

**Not proposed here.** A "no suggestions" line for an unmatched text: `e2e/search-suggestions.spec.ts`
pins that nothing is offered, and Enter already searches.

### CX-04 Back to top

**Priority** P2. **Batch** B3, after CX-05.

**Current state.** **MISSING.** No code, and live no control appeared after scrolling 2,549 px of the
home page (the only fixed element was the toast region). The pages are long (the home page is 3,449 px
at 1440 px). Scrolling elsewhere in the app is instant: a search of `src/` found no smooth-scroll code,
no `scroll-behavior` and no `scroll-padding`.

**User problem and outcome.** On a long listing or page a visitor must scroll all the way up to reach
the header. A button takes them there.

**Acceptance criteria**

1. Hidden at the top; it appears after the visitor has scrolled more than one viewport height (a named
   constant) and hides again above it.
2. A real `<button>` named "חזרה לראש העמוד", reachable by keyboard, with a visible focus ring and a
   44 by 44 px target. While hidden it is not in the accessibility tree and not focusable.
3. Activating it scrolls to the top and moves focus to the start of the page, the place
   `useFocusAtPageStart` uses, so a keyboard user is not left at the bottom.
4. It scrolls smoothly only when the system setting (and, after CX-07, the site option) does not ask for
   reduced motion; otherwise it jumps.
5. **Placement, measured.** At 320, 375 and 1440 px:
   a. it sits at the inline-end corner, and its bounding box does not intersect a visible toast (the
   toast region is `fixed` at the bottom and, at phone widths, as wide as the screen);
   b. for the critical controls (add to cart on a product page, the checkout link on the cart page, the
   submit button of sign-in and of registration, the confirm button of checkout, with a signed-in
   account in the e2e stub), after the control receives keyboard focus, its bounding box does not
   intersect the button's. Where the layout cannot keep them apart at some width, the button hides
   itself while that control is near, and the test asserts the hiding;
   c. no control that receives keyboard focus is covered by it (the element at the control's center is
   the control).
6. The scroll listener is passive and throttled, with no layout reads in a loop.

**Tests.** A unit test for the threshold and the focus move; e2e tests with and without reduced motion
and the overlap assertions of criterion 5 at the three widths; the axe scan with the button visible.
**Manual.** 375 and 1440 px, with a keyboard, and with a toast showing.

**Depends on / affects.** CX-05 (the reduced-motion hook), `RootLayout.tsx`, the budget ledger.
**Risks.** Overlap with the toast region (`bottom-4`, `ToastProvider.tsx`) and with full-width buttons
on phones (criterion 5); a layout shift when it appears (it is `fixed`; the Lighthouse limit guards it).

### CX-05 A restrained motion approach, with feedback

**Priority** P1: a foundation for CX-04, CX-07, CX-12 and CX-13. **Batch** B3.

**Current state.** **PARTIAL.** What exists: a 400 ms hero fade and a 300 ms count pop, both
`motion-safe:` (`src/index.css`); card and tile hover lifts, a button press scale and the skeleton pulse,
also `motion-safe:`; the hero autoplay reads the media query itself (`HeroCarousel.tsx`). What does not:
a toast appears and disappears with no animation (`ToastProvider.tsx` says so on purpose); add to cart
shows a toast and a count pop but nothing on the button (`AddToCartButton.tsx`); the favorite heart only
changes color (`FavoriteButton.tsx`); the checkout button only changes its text (`CheckoutForm.tsx`),
as do the sign-in and registration buttons. Plain `transition` color changes are not behind
`motion-safe`. There is no shared rule or token set, and the media-query hook is written inside the
carousel. Live (375 px): adding a product showed the toast, the count pop and "בעגלה: 1" under the
button.

**User problem and outcome.** The actions that matter give a small, clear sign that they worked, in one
consistent style, and nothing moves for a visitor who asked for less motion.

**Acceptance criteria**

1. A short written approach in a "Motion" subsection of the Conventions section of
   `docs/development.md`: which properties may animate (`transform` and `opacity` only, never layout),
   the durations and easing as design tokens in `src/index.css`, and the rule that decorative motion
   never runs under reduced motion.
2. One `prefers-reduced-motion` guard in the base layer covers every transition and animation of the
   app, and one shared hook replaces the copy inside the carousel. A change that carries meaning (a
   focus ring, a color that says "selected") stays visible without motion.
3. **Add to cart.** The button shows a brief confirmed state of about 1.5 seconds, as an icon change
   (a check, `aria-hidden`) and a short animation. **The visible text does not change**, so the
   accessible name (`הוספה לעגלה: <product>`) always contains the visible label (WCAG 2.5.3). If the
   owner prefers a visible "נוסף", the accessible name must contain that text while it shows, and the
   screen-reader check must show that it is not announced twice. The toast stays the one announcement:
   the button has no live region of its own.
4. **Favorites.** The heart gives a short pop when it fills; `aria-pressed`, the constant label and the
   toast are unchanged.
5. **Toasts** enter and leave with a short fade and rise; reduced motion removes the movement.
6. **Busy state, defined once here** and applied by CX-12 and CX-13: a button that submits shows a small
   spinner (`aria-hidden`), keeps its label (changed only where it is today), sets `aria-busy`, and stays
   disabled while it works, as it does now, so a second attempt cannot start.
7. No animation delays an action or a page, adds layout shift, or runs while the tab is hidden.

**Tests.** Unit tests with `stubReducedMotion` (`src/test/reducedMotion.ts`) for each piece in both
modes; e2e with Playwright's `reducedMotion: 'reduce'` and `'no-preference'` (the pattern of
`e2e/storefront.spec.ts`); a test that the accessible name of the add button contains its visible text
in every state; the existing carousel tests stay. **Manual.** Both modes at 375 and 1440 px; a
throttled-CPU run of the home page; the add-to-cart announcement with a screen reader (protocol in
CX-06).

**Depends on / affects.** `index.css`, `ToastProvider.tsx`, `AddToCartButton.tsx`,
`FavoriteButton.tsx`, `buttonStyles.ts`, `HeroCarousel.tsx` (the hook), `docs/development.md`, the
budget ledger. **Risks.** The announcement doubling (toast plus a changed name); the toast tests that
assume no animation (`ToastProvider.test.tsx` states it) are replaced by tests of both modes; layout
shift from the toast.

### CX-06 Accessibility baseline

**Priority** P1: benefits everyone, and the preferences panel cannot stand in for it. **Batch** B4.
The deeper review after the sign-in and checkout changes is [CX-14](#cx-14-accessibility-final-review-and-screen-reader-pass).

**Current state.** **PARTIAL.** Tested (not re-run here): axe-core (WCAG 2.0 to 2.2 A and AA) on the
home page, listing, category, product, search, cart, favorites, sign-in, registration, checkout with
errors, the confirmation and a toast (`e2e/accessibility.spec.ts`); language, direction, one `h1` and a
title per page; names of controls; the tab order of the header; and a manual keyboard pass in Chromium
in M12 (`docs/accessibility.md`). Since PR #92 the e2e axe helper also runs the label-in-name rule
(`label-content-name-mismatch`, WCAG 2.5.3) by name: axe 4.14 enabled it, and it found the cart remove
button and the "99+" count of the header links, both fixed. What the same document lists as never
checked: any screen reader,
browser zoom to 200% and 400%, text spacing, forced colors, touch and voice control, the signed-in
pages by hand, Firefox and Safari. Known by design: the search box is a `searchbox` with
`aria-activedescendant`, not an ARIA 1.2 `combobox`. A gap seen in the source and **UNVERIFIED**: nothing
in `src/` sets `scroll-padding-top` or `scroll-margin-top` while the header is sticky (64 px, plus the
category bar from 768 px), so a focused control may sit under it (WCAG 2.2 "focus not obscured"). The
carousel dots are 24 px (live), the least WCAG 2.2 allows. Whether a failed submit focuses the first
invalid field is React Hook Form's default; no test was found that pins it.

**User problem and outcome.** The automated checks pass, but the gaps above are where real problems
hide. A bounded pass tests them on what the program leaves alone, fixes what matters, records the
rest, and settles the one behavior that the later form work follows.

**Scope: a fixed matrix, not an open audit.**

- _Pages and parts:_ home, listing (with a filter and a sort), product, search with suggestions, cart,
  favorites, the not-found page; the header, mobile menu, account menu, toasts, skip link and carousel
  controls; and the shared form fields (`fields.tsx`) as the sign-in, registration and checkout forms use
  them today, for focus and error behavior only (those pages are rebuilt later, as the next bullet says).
- _Not in this stage_ (rebuilt later, checked in the batch that rebuilds them and in CX-14): the footer,
  About and Contact (B6), the hero (B7), sign-in and registration (B8), checkout and the order pages
  (B9), the preferences panel (B5), back to top (B3). A defect seen on one of them is recorded and
  handed to that batch as an acceptance criterion; it is not fixed twice.
- _Checks (A to E):_ **A** zoom to 200% and 400% (reflow at 320 CSS px, no sideways scroll, nothing
  clipped or overlapping); **B** the text-spacing override of WCAG 1.4.12; **C** Windows forced colors
  (focus and state remain visible); **D** a keyboard walk of every page: order, visible focus, no trap,
  focus not hidden by the sticky header, controls under 24 px; **E** a screen-reader pass of the tasks
  below, by the protocol.
- _Screen-reader tasks:_ find a product with the search suggestions and the arrow keys; filter and sort a
  listing; open a product; add it to the cart and hear the confirmation; open the cart; use the mobile
  menu (375 px).

**Severity and what is done with it**

| Severity | Meaning                                                                                                            | Handling in this stage                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1       | A task cannot be completed, content or a control is unreachable, focus is trapped or lost, content is lost at zoom | Fixed in this batch, with a regression test where one can be automated                                                                                                       |
| S2       | A WCAG A or AA failure with a workaround                                                                           | Fixed here if it is in the shell or a shared piece and is one focused change; otherwise written into the batch that rebuilds the page, or recorded with the owner's decision |
| S3       | Minor, or an enhancement                                                                                           | Recorded in `docs/accessibility.md` as known; not scheduled                                                                                                                  |

A defect class outside the matrix is recorded with a severity and not chased.

#### Assistive-technology protocol

Used by this item, CX-12, CX-13, CX-07 (the panel) and CX-14.

1. **Tools, in order.** NVDA with Chromium on Windows; then Windows Narrator with Edge or Chromium. If
   the Hebrew voice is missing or hard to use, use an installed voice and NVDA's Speech Viewer, which
   shows the text that is announced. Installing a tool is a download and needs the owner's explicit
   approval at that time.
2. **Alternatives, not substitutes.** If no screen reader can be run, use Playwright's accessibility-tree
   snapshot and the browser's accessibility tree for the same tasks. These are recorded as
   "accessibility-tree inspection", never as a screen-reader pass.
3. **Record, per run:** date, tool and version, browser and version, the task, what was heard (or the
   tree), the result, the defects found, with a severity. A pass is claimed only with such a record;
   otherwise the check is "not run", with the reason and what was tried.
4. A second reader or platform (Firefox with NVDA, VoiceOver, TalkBack) is listed as not run unless it
   was.

**Acceptance criteria**

1. Every cell of the matrix (page or part by check A to E) is recorded in `docs/accessibility.md` as
   pass, fail or not run, with the date, the tool and the evidence; a not-run cell says why and what was
   tried instead.
2. Open S1 findings: none. Each S2 is fixed, handed to a named batch, or accepted by the owner in the
   pull request. Each S3 is recorded.
3. If the focus-obscured problem reproduces: `scroll-padding-top` and `scroll-margin-top` sized to the
   sticky header, with an e2e check that a focused control near the top is not under the header. Dots
   and other controls under 24 px are enlarged where it costs nothing visually.
4. **Form-error behavior, one for the whole program.** On a failed submit, the first invalid field (in
   document order) receives focus, and its message is tied to it with `aria-describedby`, so it is read
   when focus lands. A form with more than five fields (checkout) may also show a summary of links to
   the invalid fields above the form; the summary is not a live region and does not take focus, so
   nothing is announced twice. An error that belongs to no field (the existing form-level `alert`: a
   wrong password, a changed price, a lost connection) keeps its `alert` role, its text and its action,
   and does not move focus. This is written in `docs/accessibility.md`, and an e2e test pins the focus
   of the first invalid field, in document order, on the existing sign-in, registration and checkout
   forms before B8 and B9 change them.
5. The decision about the search box (keep the `searchbox` pattern, or move to a `combobox`) is recorded
   with the evidence of check E. A move would be a separate item; none is proposed.
6. The `/accessibility` statement and `docs/accessibility.md` say exactly what was checked and nothing
   more, and neither claims conformance (Hebrew wording approved).

**Tests.** New e2e checks for what is fixed (zoom reflow at 320 px, focus not under the header,
forced-colors focus visibility where it can be automated), the first-invalid-field test of criterion 4,
and the existing suites unchanged. **Manual.** The matrix, recorded.

**Depends on / affects.** `index.css`, shared pieces (`fields.tsx`, header, carousel), the two
accessibility documents. **Risks.** A fix to a shared piece (`fields.tsx`, focus) reaches every form
(the form e2e tests are the guard); the effort is capped by the matrix and the severity rules above;
a screen reader may not be available, in which case cell E stays "not run" with what was tried.

### CX-07 Display preferences panel

**Priority** P2: real value, but a new stored value, a header control and global styles. **Batch** B5,
after B3 and B4, and after the pages are final.

**Current state.** **MISSING.** No code, and live no control with this purpose among the buttons of the
home page. What would make it feasible: sizes and spacing are in Tailwind's `rem` utilities (a search of
`src/` for pixel-valued utilities found only three, all breakpoints, in `Header.tsx` and
`ProductGrid.tsx`), so scaling the root font size should scale the layout. That is **UNVERIFIED**; the
zoom results of CX-06 are its first test.

**User problem and outcome.** Some visitors need larger text, stronger contrast or no motion, and do not
want to configure the whole browser. A small panel offers a few options that visibly work on every page.
It supplements CX-06 and never replaces it.

**Proposed options (to be confirmed).** Each must work on every page, or it is not offered.

| Option            | What it does                                                                         |
| ----------------- | ------------------------------------------------------------------------------------ |
| Text size         | Three or four steps that scale the root font size (for example 100, 115, 130%)       |
| Reduce motion     | Turns off the app's animations and the hero autoplay, even if the system allows them |
| Stronger contrast | Switches the color tokens to a higher-contrast set (muted text, borders, focus ring) |
| Underline links   | Underlines links inside text, so links do not depend on color                        |

A dark theme, a reading font and a line-spacing option are not proposed: they are larger, and none was
asked for.

**Acceptance criteria**

1. A button named "העדפות תצוגה" opens a small panel (a disclosure or dialog with focus managed like the
   account menu: Enter opens, Tab walks, Escape closes and returns focus, a click outside closes). Phones
   reach it from the mobile menu, not as one more header icon, so the header fits at 320 px
   (`e2e/responsive.spec.ts` checks this); the header tab-order test gets the new stop added on purpose.
2. Each option changes the page at once and can be turned off; "reset" returns every option to its
   default.
3. Choices are kept in the browser under one new `online-store:` key, per device and not per account.
   Reading the key never throws (private mode, blocked storage) and a bad value falls back to the
   defaults.
4. **Applying the stored choice, within the CSP.**
   a. The entry module applies the stored choice before React renders, by setting `data-` attributes on
   `<html>`; every visual effect is a rule of the stylesheet keyed on those attributes. There is no
   inline script, no `<style>` element and no inline `style` attribute (Rule 3).
   b. At the start of the item, check whether the built HTML of a page shows any content before the entry
   module runs (inspect `dist/index.html` and a static route page). If it shows none, (a) is enough.
   If it does, the fallback is a very small classic script file served from the site's own origin and
   loaded from `<head>`, which `script-src 'self'` allows; its cost is first measured against the
   budget ledger and Lighthouse's render-blocking audit, and if it is not acceptable the item stops
   and asks the owner.
   c. **Validation.** A Playwright test seeds the stored choices before the page loads and asserts, at the
   first React commit and at first contentful paint (from a `PerformanceObserver`), that `<html>`
   already carries the attributes and that the computed root font size is the chosen one. A trace
   (screenshots of the first frames, with the CPU throttled) is attached to the pull request to show
   that no frame is painted with the defaults when a choice is stored.
5. "Reduce motion" is read by the same hook as the system setting (CX-05), including the carousel and
   back to top; the system setting still applies when the option is off.
6. Every option is checked at 320 and 1440 px on the home page, a listing, a product, the cart, sign-in
   and checkout (all in their final form): no clipped text, no sideways scroll, no overlap, with each
   option and with all together.
7. The panel passes axe, is keyboard operable, and its controls state their state (`aria-pressed` or a
   radio group). It is checked by the protocol in CX-06.
8. The panel is a lazy chunk; the first page grows by no more than the ceiling in the budget ledger.
9. `/privacy` and `docs/state-persistence.md` list the new stored value, and the accessibility
   statement mentions the panel without presenting it as the way to be accessible.

**Tests.** Unit tests for the store (defaults, bad data, storage failure) and for applying the choices;
e2e for each option on the pages above and across a reload; the validation of criterion 4c; axe with
the panel open; `npm run check:csp` and `e2e/csp.spec.ts` unchanged and green. **Manual.** Each option
at both widths; the panel with a screen reader.

**Depends on / affects.** CX-05 (the hook), CX-06 (zoom results); `Header.tsx`, `MobileNav.tsx`,
`index.css`, the entry module, a new feature folder, `PrivacyPage.tsx`, `docs/state-persistence.md`,
`docs/accessibility.md`. **Risks.** Text at the larger sizes breaking fixed-height or truncated elements
(`line-clamp`, the header height); a flash of default styles; the header overflowing; a stored value that
outlives a change of the options.

### CX-08 A better home hero

**Priority** P2: high visibility. **Batch** B7.

**Current state.** **PARTIAL.** The home page puts the heading "חנות רכיבי מחשב", one sentence and a
"לכל המוצרים" button in a row above the carousel (`HomePage.tsx`), and the carousel is eight image-only
banners with no text of their own (`heroSlides.ts`). Live at 1440 px the carousel is 1,377 by 636 px and
carries the first screen. Live at 375 px it is **147 px high**, a thin strip under the heading and the
button. A black frame was seen in screenshots during autoplay, once at 1440 px and
once at 375 px. At 375 px only, the loading state was read: slides 5 to 8 had `complete: false` while
hidden. The black frame is **VERIFIED**; the cause (a hidden slide's lazy image is not fetched until it
is shown) is **UNVERIFIED**, a reading of the markup (`hidden` plus `loading="lazy"` in
`HeroCarousel.tsx`).

**User problem and outcome.** The first screen should say what the store is and give one clear next
step, on a phone as well as on a desktop, and the carousel should not flash black.

**Acceptance criteria**

1. A hero with a heading, a supporting line and one primary action, designed as one unit with the
   carousel: on a wide screen side by side or layered; on a phone stacked, with the text first and the
   carousel at least 200 px high at 375 px.
2. Text that sits on or over an image has at least 4.5:1 contrast, measured against the image area under
   it; everything stays readable and unclipped at 320 px, with the browser's default font size raised,
   and at 200% zoom.
3. The heading stays the page's one `h1`, in the same honest voice (a demo store, no claim of deals,
   delivery or support). New Hebrew text is approved first.
4. This item adds, replaces or removes no image asset.
5. **If the redesign keeps a carousel** (removing it is a behavior change that needs the owner's explicit
   approval in the batch plan, and its tests are then replaced by tests of what replaces it):
   a. the next slide's image is fetched before it is shown, so no black frame appears, without loading
   all eight eagerly; the first slide stays `eager` with high fetch priority;
   b. autoplay, the pause button, pause on hover and on focus, reduced motion and the accessible names
   keep working as the existing tests require, using the hook of CX-05.
6. **Baseline and comparison.** Before the first change, record the home page's Lighthouse results from
   an unchanged `main` build, in the same environment as the "after" run: three runs, the median of LCP,
   cumulative layout shift and performance score. After the change, the same three runs. The pull
   request reports both sets of medians. Layout shift stays under 0.25 (the existing gate). If the
   median LCP or score is worse than the baseline by more than the spread of the three runs, the pull
   request says so and the owner decides. No threshold is invented here, and no number is quoted until
   it is measured.

**Tests.** The carousel unit and e2e suites stay (autoplay, reduced motion); "no banner is cropped or
enlarged" in `e2e/storefront.spec.ts` and "every slide at …" in `e2e/responsive.spec.ts` are changed only
if the frame changes; a new check that the next slide's image is loaded before it is shown (criterion
5a); axe and Lighthouse. **Manual.** 320, 375, 768, 1024 and 1440 px; reduced motion; a slow network
profile for the black frame.

**Depends on / affects.** CX-05 (the hook), the budget ledger. `HomePage.tsx`, `HeroCarousel.tsx`,
`heroSlides.ts`. **Risks.** Regressing LCP; the e2e frame tests that pin the banner shapes; the
carousel's focus and hover rules.

### CX-09 Footer redesign

**Priority** P2. **Batch** B6.

**Current state.** **PARTIAL.** The footer (`Footer.tsx`; live at 1440 px) has four columns: the name
with a one-line description, the demo notice and a GitHub link; main links (home, products); the five
information pages; and all twelve categories. It has no brand links, no information about how the
project is built, no link to the documentation, and no way to report a problem. It is pinned by
`Footer.test.tsx` (the navigation names "קישורים", "מידע" and "קטגוריות בתחתית העמוד", twelve categories,
the demo text, the GitHub link opening in a new tab) and by `e2e/info-pages.spec.ts`. It is in
`RootLayout.tsx`, so it is part of the first page's weight.

**User problem and outcome.** A visitor at the bottom of the page finds the useful places quickly, and
a curious one finds the real facts about the project, not filler.

**Acceptance criteria**

1. Columns for: the store (name, one honest sentence, the demo notice kept as it is), shopping
   (products, categories, brands as links using the CX-01 helper), information (the five pages) and
   the project (the repository, its documentation, the architecture and accessibility documents, the
   issue tracker if it is enabled).
2. Every statement and link is factual and checkable: the stack as the README names it, links that
   exist. No guarantee, warranty, secure-payment claim, support hours or contact beyond
   `src/lib/links.ts`.
3. No counts of tests or builds are written into the footer, and no badge is embedded (they go stale).
   This is checked in review.
4. External links open in a new tab and keep the existing "(נפתח בלשונית חדשה)" text for screen
   readers.
5. Real headings and a reading order that matches the visual order. On phones it is one column, with
   list links at least 44 px tall. At 320, 375 and 1920 px there is no horizontal overflow and no overlap.
6. The copyright line stays true for a demo ("אתר הדגמה").

**Tests.** `Footer.test.tsx` and the info-pages e2e tests are updated for the new structure with
assertions at least as strict (every link, its target and its `rel`); a check that every internal link
and every repository link points at a path that exists; axe on every page with the footer.
**Manual.** 320, 375 and 1440 px; a keyboard walk.

**Depends on / affects.** CX-01 (the helper), wording approval, the budget ledger. `Footer.tsx`,
`infoPages.ts` if a page is added. **Risks.** Link rot to documents (the link check above); a footer
that is long on a phone.

### CX-10 About page rebuilt around the real story

**Priority** P2: content only, but the owner's voice matters. **Batch** B6.

**Current state.** **PARTIAL.** `AboutPage.tsx` is accurate and honest: what the site is, a feature
list, the stack and hosting, the cold-start note, the catalog notice. It is organized as a manual, not a
story, and says nothing about how the project was built or tested. Its sentence "למיין לפי מחיר או שם"
lists the sort orders and becomes incomplete when CX-02 lands (it stays true). The page description is in
`infoPages.ts`, which `scripts/static-routes.mjs` copies into the static HTML. Material for a story
exists in the repository: `docs/project/05-project-history.md` (Hebrew), `docs/project/07-engineering-process.md`,
`docs/testing.md`, the 14 decision records, and the QA remediation report on the GitHub release
`docs-v2.1` (listed on the Releases page, checked live). The documents under `docs/project/` and the two
project books were written before the QA program; their release notes date the books to 2026-10-08. They
may be out of date.

**User problem and outcome.** The page tells a visitor who built this, why, with what, how it was
developed and how it is tested, and that it is a demonstration, in a form that is pleasant to read.

**Acceptance criteria**

1. Sections: why the project exists and what it is; the story in four or five steps (the legacy static
   site, the rebuild in React and TypeScript, the API and the database, hardening, the quality program);
   the technology and where it runs; how it was built (small reviewed pull requests, CI that gates both
   deployments); how it is tested (the layers, in words); what it is not.
2. **Verified against current `main`.** Before the text is drafted, a list of facts is written in the
   pull request, each with the file or command on current `main` that shows it (a document under
   `docs/project/` is not accepted as the only source). A statement that cannot be checked there is not
   written.
3. No customers, testimonials, revenue, team, company or support, no payment guarantee, and no claim
   that the demo is a business. It stays honest about its limits (a free hosting plan that sleeps, no real
   payment, no administrators), as the current page is.
4. No number (tests, pull requests, records) is typed into the page; a number is left out or linked to
   the document that holds it, so the page cannot go stale. This is checked in review.
5. The sentence about sorting is correct for the orders that exist when the page is written, and the page
   links to the project's documents and, if the owner wants, to the release with the QA report.
6. Short paragraphs and clear headings, with one `h1`; the page description is updated through
   `infoPages.ts`.

**Tests.** `src/pages/infoPages.test.tsx` and `e2e/info-pages.spec.ts` are updated (headings, links that
exist, no `mailto`); axe. **Manual.** Read at 375 and 1440 px; every link opened.

**Depends on / affects.** Wording approval, the owner's choice of what to link. `AboutPage.tsx`,
`infoPages.ts`, `docs/seo.md` if the description rule changes. **Risks.** Overclaiming; text that goes
stale; a long page that is not read.

### CX-11 A human contact page with a short FAQ

**Priority** P2. **Batch** B6.

**Current state.** **PARTIAL.** `ContactPage.tsx` says correctly that this is a demo with no support, no
phone, address, hours or form, and gives the GitHub profile and the repository. It is cold in tone and
has no FAQ. `e2e/info-pages.spec.ts` pins that the page has exactly those two external links, no
`mailto`, `tel` or WhatsApp link, and no form, input or textarea.

**User problem and outcome.** A visitor with a question gets a warm, honest answer in the first lines,
and finds the common answers without leaving the page.

**Acceptance criteria**

1. A welcoming opening that is true: who made the site, that it is a demo, and the one way to reach the
   maintainer (GitHub), without pretending to be a service desk.
2. A short FAQ of five to seven questions, built from facts the site already states and checked against
   the current terms, privacy and accessibility pages and the current code: is this a real store; will I
   be charged or sent anything; what happens to a demo order; what does the site store about me; how do I
   report a bug or an accessibility problem; why does the first load take long; can I delete my account
   (today there is no way, stated plainly). Each answer is short and links to the page that holds the
   detail.
3. The FAQ is accessible: native disclosure elements or an equivalent pattern with keyboard use, names and
   state; every answer is readable without script; nothing is hidden from a screen reader that a sighted
   visitor can read.
4. Nothing implies real support: no response time, no "we will reply", no hours, no phone, no email, no
   chat, no form. The two GitHub links remain the only external contact links.
5. The constraints pinned today (two external links, no form or input, no `mailto` or `tel`) keep
   holding; those tests are extended, not weakened. A `<details>` element is not a form control.
6. No wording is repeated from the About page; the two pages link to each other.

**Tests.** The contact test of `e2e/info-pages.spec.ts` stays as it is and gains FAQ assertions (count,
keyboard open and close, each answer's link); a unit test of the FAQ; axe. **Manual.** Keyboard and a
screen reader on the FAQ (protocol in CX-06); 375 px.

**Depends on / affects.** Wording approval; the privacy and terms pages as link targets.
`ContactPage.tsx`, `InfoPage.tsx` (a shared FAQ piece), `infoPages.ts` description. **Risks.** A
well-meant sentence that promises something ("נחזור אליכם") and breaks criterion 4; a FAQ answer that
contradicts the terms or privacy page.

### CX-12 A welcoming sign-up and sign-in

**Priority** P1: every new customer passes here. It is authentication code, so it is its own batch.
**Batch** B8.

**Current state.** **PARTIAL.** What works and stays: `LoginForm.tsx` and `RegisterForm.tsx` use React
Hook Form with Zod, `noValidate`, `mode: 'onTouched'`, Hebrew messages, errors tied to fields with
`aria-describedby`, a role `alert` for form-level errors, autocomplete attributes, a vague sign-in error
that does not say which part was wrong, rate limits, a password hint, and the notice shown after a
session ended (`LoginPage.tsx`). Seen in the source: no password visibility toggle (live on `/register/`:
two password fields and no such button); no `dir="ltr"` on the email field (the checkout sets it, the
auth forms do not); the busy state is only a changed label and `disabled`, with no `aria-busy` or
spinner; the page is a plain card under a long demo notice and the `h1`, with no welcome. Typed values
after a failed attempt are kept by React Hook Form, but no test was found that pins it (a keyword search
of `src/pages/auth.test.tsx` and the other auth tests; not proof that none exists). Live validation
messages and the submit flow were not exercised on the deployed site, because that would create a real
account in production. The notice at the top of both pages says the site is a demo, that the account is
real and kept on the site's server, that a password from another site should not be reused, and that
orders carry no real payment; `e2e/auth-checkout.spec.ts` ("says that this is a demo store, and that the
account is kept on the server") pins it.

**User problem and outcome.** Signing up should feel friendly and low effort: see what you type, get
clear help when something is wrong, never lose what you typed, and understand the demo without a wall of
text.

**Acceptance criteria**

1. A visibility button on each password field (`aria-pressed`, a name such as "הצגת הסיסמה" and
   "הסתרת הסיסמה", keyboard operable). The field is hidden by default, returns to hidden after a submit,
   when the form unmounts and when the page is hidden, and the toggle does not change autocomplete,
   validation or what is sent. On the registration page the two fields may share one toggle.
2. The email fields are `dir="ltr"`, with the email keyboard and with `autocapitalize` and `spellcheck`
   off; the label and the error stay right to left.
3. **A welcome, and mobile usability.** A short heading and line of text above the form, and the demo
   notice shortened. At 375 by 667 and 320 by 568 px: the first field is visible without scrolling and
   the submit button is reachable without a long scroll; controls are at least 44 px high; there is no
   sideways scroll; focus moved to the button is not hidden by the sticky header. With the keyboard: the
   tab order follows the visual order, Enter submits, and focus is always visible. A clear link to the
   other form stays.
4. **Disclosures preserved.** The shortened notice still says, on both pages, that this is a demo, that
   the account is real and kept on the site's server, that a password from another site should not be
   reused, and that orders carry no real payment (new wording is approved first); the e2e test above is
   updated to assert at least the same four facts.
5. Validation messages stay in Hebrew and become more helpful where they are terse, without changing any
   rule: the password policy (8 to 128 characters, the common-password list, not equal to the email, no
   composition rules) and the meaning of its messages are untouched.
6. **Form errors** follow the one behavior of CX-06 (first invalid field in document order receives
   focus; no error summary on these short forms); a server error (taken email, unavailable, too many
   attempts) is announced once through the existing `alert` and does not move focus.
7. The busy state of CX-05 on both submit buttons, and no double submit.
8. Typed values (name, email, and after a failed server answer the passwords) are kept in the form
   after a failed attempt and are never written to storage; a test pins it.
9. No new stored data, and no change to the session, `authStore`, `authService`, the API, the CSP or any
   rate limit. The vague sign-in error and the generic registration error stay as they are.
10. The `h1`, landmarks, labels and the redirect behavior (`getRedirectTarget`, state kept through the
    link between the two pages) work as before; both pages stay lazy-loaded.
11. **Screen reader.** The protocol of CX-06 is run on sign-in and on registration (labels, hints, an error
    on each kind of field, the toggle's state, a server error, success) and recorded.

**Out of scope on purpose.** A password strength meter (the policy has no composition rules and a meter
would suggest one), "forgot password", email confirmation, social sign-in and account deletion (the
earlier remediation program excluded them and the README lists them as limits).

**Tests.** Unit tests for the toggle (default hidden, reset after submit, state, no effect on the value),
for focus on the first invalid field, for kept values and for the busy state; the existing
`src/pages/auth.test.tsx`, `e2e/auth-checkout.spec.ts`, the password-policy e2e and the axe scans of both
pages stay green with only the changes the rules above allow; e2e checks at 375 by 667 and 320 by 568 px
for criterion 3. **Manual.** Keyboard only, a phone keyboard, a password-manager fill, 320 px, the
throttled network for the busy state, and the screen-reader record.

**Depends on / affects.** CX-05 (the busy state), CX-06 (field fixes and the form-error behavior), wording
approval. `AuthCard.tsx`, `LoginForm.tsx`, `RegisterForm.tsx`, `fields.tsx`, `LoginPage.tsx`,
`RegisterPage.tsx`. **Risks.** Anything that touches credentials: the toggle must not leave a password
visible, in the DOM of a hidden tab or in a screenshot of a finished page; a change in `fields.tsx` reaches
the checkout form too (its tests are the guard); autofill and password managers react to a changed `type`;
the redirect state. Reviewed with the engineering gates, including a mutation check of the toggle's reset.

### CX-13 A clear and reassuring checkout

**Priority** P1: the last step before an order, but the riskiest area, so it is its own batch and
presentation-focused. **Batch** B9.

**Current state.** **PARTIAL**, from the source and tests; the signed-in page is **UNVERIFIED** live.
The page is a single page with two fieldsets (contact, address), a demo notice and a required
confirmation checkbox, a labelled summary (`OrderSummary.tsx`: a `dl` with item count, price before
discounts, savings and total, and the note that shipping and VAT are not calculated), a product list
(`OrderLines.tsx`), a total strip above the button on small screens, a role `alert` for a changed price
(with the new total) and for an unavailable product (with a removal action), a recovery notice for an
order that may already exist, a restored-details notice after a session ended, and a confirmation page
with the order number and a payment panel (`OrderPage.tsx`, `PaymentPanel.tsx`).

_Where the logic lives._ Logic and layout are not separated. `CheckoutPage.tsx` holds, together with its
JSX, the order handler (`placeOrder`: the cart check against another tab, `takeCartNow`, the idempotency
key and `expectedTotal`, the account-change guard, the switch over the API's answers), the effects that
read the saved draft and look up an unresolved attempt, the notices, and the two-column layout.
`CheckoutForm.tsx` holds the form state, the error display and the demo checkbox. The reliability
logic that is already separate lives in `submitOrder.ts`, `checkoutAttempt.ts`, `checkoutDraft.ts`, the
schemas and `orderService.ts`; the orchestration that calls it is inside the components.

_Gaps seen in the source._ No steps or progress. On a phone the list and the summary come after the
whole form, so a visitor confirms having seen only the total strip. A failed submit shows one top-level
message and focus handling is React Hook Form's default (no test was found that pins it). The button
shows only a changed label while working. The demo is explained in four places: the notice at the top, the
note under the address heading, the confirmation checkbox and the note in the summary. Tests that protect
the page: `src/pages/checkout.test.tsx`, `checkoutSessionRecovery.test.tsx`, `demoOrderCopy.test.tsx`,
`orderPayment.test.tsx`, `e2e/auth-checkout.spec.ts`, `e2e/orders.spec.ts`, `e2e/demo-payment.spec.ts`,
`e2e/checkout-session-recovery.spec.ts`, and the axe checkout scan.

**User problem and outcome.** The visitor knows where they are, what they are ordering and what it
costs, understands in a sentence what a demo order is, and gets a clear result.

**Behavior that must not change.** Order reliability and security: the idempotency key and its reuse,
`expectedTotal` and the `409` handling, server pricing, `takeCartNow`, the saved draft after a session
ends, the lookup of an unresolved attempt, the account-change guard, validation, and the simulated
payment.

**Work in two steps, kept apart in the history.**

- **Step 0, only if the layout cannot change without it.** Characterization tests first: inventory what
  the tests above already cover for each behavior in the list, and add a test for each uncovered one
  (order placed and navigation; price changed; product unavailable; key reused and recovery; session
  ended and draft; account switched while sending; cart changed in another tab), run against the
  unchanged code. Then a mechanical-only change (moving the layout or the handlers into separate pieces)
  in its own commits, with no behavior change: the same tests, unchanged, pass before and after, and the
  review reads it as a move.
- **Step 1, presentation.** Only after step 0 (or when no move is needed), the presentation changes
  below. Handlers, effects, refs and state transitions are not edited in this step.

**Acceptance criteria**

1. **Orientation.** The page names what it asks for (contact details, delivery address, confirmation) in
   a labelled list near the top, and a short text before the button says what confirming does (a demo
   order is saved and appears in "my orders"; nothing is charged or sent). It must not suggest a step
   that does not exist: there is one confirmation, and no "step N of M" counter.
2. **Phone.** The order is visible before confirming: a collapsible order summary at the top, native
   `details` or an equivalent, with the total in its summary line, open or closed by keyboard. Its lines
   and totals are identical to the wide-screen summary, which stays beside the form.
3. **Pricing** stays transparent and unchanged: the same numbers, "price before discounts", savings,
   total, and the line that shipping and VAT are not calculated. The Eilat price is not added to the cart
   or the order. The total shown is the one sent as `expectedTotal`.
4. **Demo disclosure, fewer duplicates.** Before the change, the pull request lists every disclosure on
   the page and the facts each states: no real payment; no product shipped; the address is checked only
   by format; the order and delivery details are saved in the account on the site's server; do not enter
   real details you do not want stored; shipping and VAT are not calculated. After the change every one
   of these facts is still stated at least once before the confirm button; the confirmation checkbox
   stays and still says that the order is a demo; and one clear demo statement is visible at the top of
   the form without any interaction. Copies that state the same fact are merged, and the pull request
   shows which, with approved wording. The address fieldset keeps an accessible description, pointing at
   a remaining statement if its own note is merged. In `demoOrderCopy.test.tsx` and the checkout tests,
   each assertion about a removed copy is replaced by an assertion that its fact is still present, and
   none is deleted without a replacement.
5. **Errors, one behavior** (CX-06). On a failed validation the first invalid field in document order
   receives focus and its message is read; because this form is long, a summary of links to the invalid
   fields is shown above the form, not as a live region and without taking focus; following a link moves
   focus to its field. Errors that belong to no field (changed price, unavailable product, connection,
   session ended) keep their `alert` role, their text and their action.
6. **Busy state** of CX-05 on the confirm button, and no second attempt can start.
7. **Success.** The confirmation shows the order number, says it is a demo order and what was saved, and
   links to "my orders" and the products; focus and the announcement stay as they are.
8. **No behavior change** to the list above: `submitOrder.ts`, `checkoutAttempt.ts`, `checkoutDraft.ts`,
   the schemas, `delivery.ts`, `orderService.ts`, the server and the OpenAPI document are not edited, and
   inside `CheckoutPage.tsx` and `CheckoutForm.tsx` the diff shows layout and copy only (plus the moves
   of step 0).
9. The page keeps working with the cart changing in another tab, an expired session and a lost answer
   (the existing tests), and passes axe in each of its states.
10. **Screen reader.** The protocol of CX-06 is run on the whole flow (a validation error, the summary
    links, a price change, success) and recorded.

**Tests.** The suites named above stay green with only the changes that criterion 4 and Rule 1 allow;
new tests for the collapsible summary (keyboard, the same totals as the wide one), for the error summary
and the first-invalid-field focus, and for the busy state; an e2e at 375 px that the order is visible
before confirming. **Manual.** A full demo order on a local build with the stub API at 375 and 1440 px,
by keyboard only, with reduced motion, with the browser's text size raised, and with the screen reader;
a deliberate price change and an unavailable product to see both notices. The production page is
checked after the deploy with a throwaway account that the owner creates.

**Depends on / affects.** CX-05 (the busy state), CX-06 (field fixes and the form-error behavior), CX-12
(field changes that reach this form). `CheckoutPage.tsx`, `CheckoutForm.tsx`, `OrderSummary.tsx` (also
used by the cart page), `OrderLines.tsx`, `OrderPage.tsx` for the success copy. **Risks.** The most
important of the program: a presentation change that alters when a request is sent, double submits, a
changed `expectedTotal`, a lost focus after a recovery notice, a removed demo fact, the cart page sharing
`OrderSummary`. Reviewed with the engineering gates, with mutation checks on the summary total and on the
disclosure test.

### CX-14 Accessibility final review and screen-reader pass

**Priority** P1: the evidence that the program left the site more accessible, and the source for the
final summary document. **Batch** B10, after B8, B9 and B5.

**Current state.** Not started. It depends on the finished flows and on the results of CX-06, CX-12 and
CX-13.

**User problem and outcome.** Pages that were rebuilt after the baseline are checked as they now are,
end to end, with the same protocol, and the statement of what was and was not checked is made true.

**Scope: fixed flows, not an open audit.**

| Flow | What it covers                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1   | Browse and search: header search and suggestions, a brand link from the home page, the listing with a filter and the recommended sort, a product |
| F2   | Cart: add (with the feedback of CX-05), change a quantity, favorites, back to top                                                                |
| F3   | Register and sign in, including the toggle, errors and success                                                                                   |
| F4   | Checkout with an error and then success, the order page                                                                                          |
| F5   | The account menu, "my orders", sign out                                                                                                          |
| F6   | The preferences panel: each option, persistence across a reload, reduced motion                                                                  |
| F7   | The footer, About and Contact (the FAQ), and the hero with its controls                                                                          |

**Acceptance criteria**

1. Checks A to D of CX-06 are repeated on every page the program changed since the baseline, and check E
   (the protocol) is run on F1 to F7. Every cell is recorded in `docs/accessibility.md` as pass, fail or
   not run, with date, tool and evidence.
2. Open S1 findings: none. Each S2 is fixed or accepted by the owner in the pull request, in writing.
   Each S3 is recorded.
3. The axe suite covers every page and state the program added or changed, and the Lighthouse accessibility
   threshold (0.95) holds.
4. `/accessibility` and `docs/accessibility.md` say exactly what was checked and what was not, with no
   claim of conformance (Hebrew wording approved), and a short list of results is kept for the summary
   document that closes the program.

**Tests.** New or updated e2e checks for what is fixed; the existing suites unchanged. **Manual.** The
matrix, recorded. **Depends on / affects.** All other items; the two accessibility documents.
**Risks.** Findings late in the program: S1 blocks the end of the program, S2 follows the rule above, so
the review cannot grow without limit.

## Deferred and not proposed

| Subject                    | Status       | Reason, and what would reopen it                                                                             |
| -------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| PWA                        | **Deferred** | Owner decision. Offline caching would also interact with the cart sync and the session; needs its own design |
| PC Builder                 | **Deferred** | Needs reliable component specifications and a credible compatibility model; the catalog has 31 products      |
| Product videos             | **Deferred** | Owner decision, until suitable assets and a performance-conscious approach exist                             |
| Promotions and discounts   | **Deferred** | Owner decision. The Eilat price stays exactly as it is                                                       |
| Biggest-discount sort      | Not proposed | Excluded by the owner                                                                                        |
| Popularity or best sellers | Not proposed | Excluded by the owner; there is no sales data                                                                |
| Contact form               | Not proposed | Excluded by the owner: there is nobody to answer it                                                          |
| Dark theme                 | Not proposed | Not asked for; a larger change than the preferences panel. Can be added to CX-07 later                       |
| Password strength meter    | Not proposed | The policy has no composition rules; a meter would imply some                                                |
| Brand pages with content   | Not proposed | Brand links use the existing filtered listing; two brands have one product each                              |
| ARIA combobox for search   | Not proposed | CX-06 records the decision; a move would be its own item                                                     |

## Open questions

These need the owner's answer before the batch that depends on them. None blocks B1 or B2.

1. **Display options (CX-07).** Are the four options (text size, reduce motion, stronger contrast,
   underline links) the right set, and should the button sit in the header on desktop and in the menu on
   phones?
2. **Footer (CX-09).** Is linking to the repository's issue tracker as the way to report a problem
   acceptable? It is a public channel, and the contact page already points to the profile and the
   repository for reports.
3. **Release link (CX-10).** Should the About page link to the `docs-v2.1` release (the QA report)?
4. **Branch names.** The earlier program used `phase/NN-name`. For this one the proposal is `cx/NN-name`
   (for example `cx/01-browsing-quick-wins`).
5. **Budget ceilings.** Are the per-item ceilings of the [Budget ledger](#budget-ledger) acceptable as the
   starting allocation?

## What remains unverified

| Subject                                                                                | Why it was not checked                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The signed-in checkout, the order page and "my orders" live                            | They need an account on production; creating one on the live site was not done. Covered by source and by tests only                                                                                                                                                          |
| Live validation and submit of the sign-in and sign-up forms                            | A submit creates a real account or a real rate-limit count in production                                                                                                                                                                                                     |
| Any screen reader, zoom to 200% and 400%, text spacing, forced colors, Firefox, Safari | Not run yet. They are planned: CX-06 (baseline), CX-12, CX-13 and CX-14 (final), by the protocol in CX-06                                                                                                                                                                    |
| A real phone                                                                           | Only a 375 by 812 px viewport of the in-app browser was used                                                                                                                                                                                                                 |
| Lighthouse scores of the deployed site                                                 | Not run here. The Lighthouse, Security and CI workflows of `c8de10a` show as passed on GitHub Actions; scores were not read                                                                                                                                                  |
| Test results                                                                           | No suite was run during the discovery. Later, for PR #92, a local run gave 2,814 site, 1,615 API (116 skipped), 116 integration and 375 end-to-end tests (4,920 with the integration ones); the README still says 4,916, and is refreshed at the end of the program (Rule 7) |
| Bundle size of the current `main`                                                      | Measured on a fresh local build of `4a45b38` (see the Budget ledger); CI's `check:bundle` was not read for that commit                                                                                                                                                       |
| The second site on Netlify                                                             | Not opened                                                                                                                                                                                                                                                                   |
| Cold-start timing of the API                                                           | The "the server is waking up" notice and a first suggestion answer of a few seconds were seen once; not measured                                                                                                                                                             |
| Focus hidden by the sticky header                                                      | A gap in the source only (no `scroll-padding`); not tested with a keyboard                                                                                                                                                                                                   |
| Scaling the root font size                                                             | The `rem` basis is read in the source; no page was tried at a larger size                                                                                                                                                                                                    |
| What the listing shows when the API answers `400`                                      | Not inspected; the rollout of CX-02 is designed so that the case does not arise                                                                                                                                                                                              |
| Whether the built HTML shows content before the entry module runs                      | Not inspected; it decides the method of CX-07 criterion 4 and is checked at the start of that item                                                                                                                                                                           |
| Eilat in `scripts/`, in the static pages and in any search-engine output               | Only the source of `src/` and `server/src` was searched                                                                                                                                                                                                                      |

## Revision notes

- **2026-10-19, first version.** Written from the discovery.
- **2026-10-19, second version.** After the critical review and the owner's decisions: CX-02 rollout
  redesigned around two lists (accepted keys and visible options) because the first plan could not keep
  the option hidden; CX-03 set to 520 px; accessibility split into a baseline (CX-06) and a final review
  (CX-14) with a severity scheme, a fixed matrix and an assistive-technology protocol, and one
  form-error behavior; CX-13 described as presentation-focused with a characterization and
  mechanical-move step; demo-notice reduction defined with the facts that must remain; evidence
  statements corrected; the "What already exists" table replaced by an index; completion criteria
  gathered into Rule 10; a budget ledger added; batch order changed (Order column).
- **2026-10-19, added to the repository.** The baseline now says that `main` moved to `4a45b38` after
  PRs #90 to #92; the bundle ledger starts from a fresh build of that commit (JavaScript 138.9 KiB, CSS
  7.9 KiB), with the reserve recomputed; the CX-06 current state and the list of unverified items
  mention PR #92 and the test counts seen while making it. Nothing else in the plan changed.
