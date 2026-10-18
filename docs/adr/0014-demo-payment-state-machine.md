# 0014. A simulated payment: stored facts, the database's clock, and only what a majority has

**Status:** Accepted

## Context

The store is a demo: no provider, no merchant account, no card. It should still show what a payment
does (an attempt that is processing, approved, declined, cancelled or timed out, a retry, a duplicate
approval, a refund) without ever charging anything and without the browser being able to write a
"paid" state.

The API runs on a free host that sleeps and restarts, so a timer in the process cannot decide anything;
it may run on more than one instance, whose clocks differ; MongoDB is a replica set in production
(Atlas) and a single server in CI and on a developer's machine, so there are no transactions to rely on
in the tests, and a write that is not confirmed by a majority can be undone by a failover.

## Decision

**The visitor picks a scenario, the server decides the rest.** An attempt is started with one of
`approve`, `decline`, `provider_cancel`, `no_answer`, `duplicate_approval`. The scenario is stored with
the attempt and is the only thing the client ever says about it: the bodies of the payment routes are
strict, so a status, an outcome or an amount is refused (`400`). This is a simulation: the visitor
chooses whether it is approved. What the design protects is not money but consistency: an order is paid
at most once, only through the transitions below, never after its time, and never refunded unless paid.

**There is no signature.** A signed "webhook" made and checked by the same process, with a secret that
process holds, would protect nothing that the process itself could not already write. The fictional
provider is a pure function of the stored attempt (`confirmationsFor`), and what a real webhook handler
must do with its messages, ignore a message it has already applied and one about an attempt already
decided, is the pure `applyConfirmations`. A real integration would add a shared secret, a time window,
an endpoint and a record of delivered events.

**The model.** An attempt is `processing` until its deadline (`settlesAt`, or `timeoutAt` for
`no_answer`), then `succeeded`, `failed`, `cancelled` (by the provider) or `timed_out`; the visitor may
cancel it before the deadline (at the deadline the provider comes first). Every status but
`processing` is final. A retry is a new attempt, at most three per order, one processing at a time.
The order's payment is `awaiting` until an attempt succeeds (`paid`, which can become `refunded`) or its
time is up (`expired`, 30 minutes after it was placed). An attempt may start only if it can end by
then: `now + timeout <= expiresAt`. A message after an attempt is decided changes nothing; a late
approval after a timeout or a cancellation is out of scope (the provider never sends one). Orders keep
`status: 'placed'`, so a site that knows only that still reads every order; the payment is a new field,
`payment`, null for an order placed before it existed.

**Facts, decided on the database's clock, stored before they are shown.** The order document holds the
payment: the attempts with their key, scenario and times, the refund, a version and the order's timings
(the settle delay and the timeout it was placed with, so a later change of settings never moves an
existing order). Every decision is made at `max($$NOW, the latest stored time)`, and every write is a
compare-and-set on the version and the stored statuses, with the deadlines it relies on checked again
by MongoDB on its own clock when it writes (`$expr` on `$$NOW` and the stored fields). A decision that
is due (an attempt the provider has decided by now, an order whose time is up) is stored by the next
request that reads the order, in one write, before it is shown, so an outcome that was shown cannot be
undone by a later request or by a clock that is behind. The list of orders never writes: it shows the
stored state and `pendingUpdate`.

**Only what a majority has.** Orders are written with `w: 'majority'` and `wtimeoutMS: 10000`. A write
that is not confirmed is `503 write_not_confirmed` (it may exist; the same request again finds out). A
payment is shown only from the request's own confirmed write or from a majority read, and an order that
a plain read finds but a majority read does not is `503 order_not_confirmed`, never "no order", so the
checkout of ADR 0005 never places a second one. Whether an order exists is still a plain read.

**The page trusts the server only.** It shows what the API answered, asks again every second while an
attempt is processing (40 times at most), and compares every answer with what it shows, for that session
and that order only: a later state is shown, an older one (a lagging copy) is kept and asked again, and
two that cannot both be true stop the payment part of the page until it is reloaded.

## Consequences

What is enforced by the code, whatever the clocks and however many instances or requests:

- every stored payment keeps the rules above (at most one attempt processing and one succeeded, no
  attempt that ends after the order, a cancellation only before the deadline, a refund only after a
  payment, times in order), and a stored final state is never changed by any command;
- a failed compare-and-set changes nothing, and several transitions are stored together or not at all;
- an answer shows a final state only if a majority has it.

What depends on the deployment, and is not tested here (CI and local tests run on a single server):

- that an acknowledged majority write survives a failover, and that a final state that was shown is
  therefore never undone (MongoDB's guarantee for a replica set, and journaling of majority writes,
  its documented default);
- that a majority read on a new primary catches up quickly: until it does, a page may see an older
  state, which it keeps back; a command is still checked against the latest copy.

What is accepted:

- reading an order may write it (once per decision), so `GET` is not read-only; it stays safe and
  idempotent: the outcome was already fixed, and repeating the request changes nothing more;
- there is no global bound on compare-and-set attempts from many requests at once (each request makes at
  most three), and reads have no rate limit of their own; payment commands share 30 an hour per address;
- the 30 minutes are counted from the process's clock when the order is placed, so they are as exact as
  that clock is to the database's;
- nothing is a real payment: no provider, no card data, no money, no signature, no reconciliation of a
  late approval, no partial refund. A real store would need all of those, a merchant account and the
  rules that come with card data.

Alternatives that were weighed: a synchronous outcome without an attempt that processes (simpler, but
nothing to show of timing, retry or duplicates); a page that imitates a provider's site (looks real,
which a demo must not); a separate `payments` collection (needs a transaction to stay consistent with
the order, which the test databases cannot give); an HMAC between two parts of one process (no real
boundary); computing outcomes from the clock without storing them (a slower clock after a failover could
undo a result that was shown).

## In the code

`server/src/orders/payment.ts` (the facts, the provider, what is due, the commands, the view),
`server/src/orders/repository.ts` (`updatePayment`, `readWithClock`, the write and read concerns),
`server/src/orders/service.ts`, `server/src/orders/routes.ts`, `server/src/orders/schemas.ts`,
`src/features/orders/payment.ts` (the public view, its checks and the comparison of two answers),
`src/features/orders/useOrder.ts`, `src/features/orders/PaymentPanel.tsx`,
`src/features/orders/paymentLabels.ts`, `docs/openapi.yaml`. Tests: `server/src/orders/payment.test.ts`,
`service.payment.test.ts`, `routes.payment.test.ts`, `payment.integration.test.ts`,
`server/src/testing/memoryOrderRepository.test.ts`, `src/features/orders/payment.test.ts`,
`useOrder.test.tsx`, `orderSchemaCompat.test.ts`, `paymentOpenapiContract.test.ts`,
`src/pages/orderPayment.test.tsx`, `e2e/demo-payment.spec.ts`.
