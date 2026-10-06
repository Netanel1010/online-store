# Production roadmap M1–M8: progress

Work on the branch `chore/production-roadmap-m1-m8`, one commit per milestone, in order. The commit
of each milestone is in `git log`; the final report ([production-roadmap-m1-m8-report.md](production-roadmap-m1-m8-report.md))
lists every SHA.

| M   | Status | Summary                                                                                                                                          |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | DONE   | The e2e safety net excuses a request only when the page itself cancelled that address (`ERR_ABORTED`); every other failure still fails the test. |

## M1: E2E reliability

- **Cause:** `e2e/support/test.ts` failed a test on any `requestfailed`, including the
  `net::ERR_ABORTED` of a request the storefront cancels on purpose (`useProductListing` aborts the
  previous listing request when a filter changes). Whether that report arrived before the test ended
  depended on timing: `filter-sort.spec.ts` failed 2 of 5 runs on clean `main`.
- **Fix:** `e2e/support/requestFailures.ts`. A wrapper around `fetch` reports every request whose
  `AbortSignal` the page aborts. A failure is excused only if it is `ERR_ABORTED`, it is a fetch/XHR,
  and the page cancelled that exact address (one cancellation excuses one failure). The decision is
  made when the test ends, so the order of the two reports does not matter. The application is
  unchanged.
- **Tests:** `e2e/safety-net.spec.ts` (7): a plain abort and a derived-signal abort are excused; an
  abort the page did not cause, a connection failure (even if the page cancelled it later), a
  failure of another address, a second failure of the same address and an aborted image still fail.
  The formerly flaky spec passed 270 of 270 runs (15 repeats); the full suite passed (271).
- **Known issues:** none.
