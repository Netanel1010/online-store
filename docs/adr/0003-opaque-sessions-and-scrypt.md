# 0003. Opaque server-side sessions instead of JWT, and passwords hashed with scrypt

**Status:** Accepted

## Context

Sessions need to be revocable (sign-out must really end a session) and the API should have as few
secrets to manage as possible. Passwords must be stored so that a copy of the database cannot be used
to sign in, on a small host with limited memory.

## Decision

- A session is a row in `sessions`. The token is 256 random bits (43 base64url characters); only its
  **SHA-256 digest** is stored, with the account and an end date 7 days after sign-in. A token is
  valid only while its session exists. No JWT is used: nothing is signed, so **there is no secret to
  configure or rotate**.
- Expired sessions are removed by a MongoDB TTL index, and the API also checks the end date, because
  that removal is not instant. An account keeps at most 10 sessions (the oldest ends at the next
  sign-in), and `POST /api/auth/logout-all` ends all of them.
- Passwords are hashed with **scrypt** from Node's `crypto` (N = 2^15, r = 8, p = 3, 32 MiB, a random
  16-byte salt), with the parameters written into the hash so that they can be raised later, and
  compared in constant time. An unknown email is checked against a decoy hash.
- There is one kind of account. No roles exist because nothing in the store needs them.

## Consequences

- Revocation is real and immediate, and nothing has to be configured to sign sessions.
- Every authenticated request costs one indexed lookup (`tokenHash_unique`).
- scrypt is expensive on purpose, so hashing is protected: per-address limits, a per-email limit on
  failed sign-ins, and a gate that allows two hashes at once with eight waiting, the rest answered
  `503 server_busy` ([0010](0010-in-house-limits-and-headers.md)).
- Not built, because nothing asked for them: password reset, email confirmation, changing a password,
  a list of devices.

## In the code

`server/src/auth/` (`tokens.ts`, `passwords.ts`, `service.ts`, `sessionRepository.ts`),
`server/src/lib/concurrencyGate.ts`, `docs/production-roadmap-progress.md` (M2, M8).
