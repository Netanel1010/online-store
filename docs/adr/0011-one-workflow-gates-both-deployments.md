# 0011. One workflow gates both deployments

**Status:** Accepted

## Context

The site (GitHub Pages) and the API (Render) deploy independently, and a broken commit should reach
neither. A site whose products cannot be loaded should not be published.

## Decision

- **One workflow, `ci.yml`.** Three jobs run in parallel on every pull request and push to `main`:
  `verify` (format, lint, typecheck, site and API tests, both builds), `integration` (the MongoDB tests
  against a throwaway MongoDB 8 service container) and `e2e` (Playwright against the production
  build). On `main` only, `deploy` has `needs: [verify, e2e, integration]`.
- **Render follows the same gate:** `autoDeployTrigger: checksPass` in `render.yaml`.
- **The deploy job checks production first.** When the repository variable `API_URL` is set it runs
  `scripts/check-api.mjs` (ready, health, products readable, CORS for the site and not for others,
  catalog drift, hardening headers), waiting up to five minutes for a sleeping host, and only then
  publishes to Pages. Without `API_URL` the check is skipped and the site deploys as before.
- **Hardening and drift findings are warnings in the deploy job**, errors with `STRICT_HARDENING=1`.
  The job checks the API that is deployed at that moment, which is the one before the change being
  deployed, so strict checks would block the very deploy that ships the fix.
- **Dependency and code scanning is a separate workflow** (`security.yml`: `npm audit` of shipped
  packages and CodeQL), deliberately not a gate, so a newly published advisory can never stop a deploy.
  The same goes for the Lighthouse budgets (`lighthouse.yml`) and the nightly read-only smoke test of
  production (`smoke.yml`, added in M12): a timing on a shared runner, or a problem at Atlas at night,
  must not decide whether a commit may ship. What is deterministic, the gzip size of the first page, is
  a step of `verify` (`npm run check:bundle`) and does gate.
- Every action is pinned to a commit; the Node version comes from `.nvmrc`.

## Consequences

- The deploy job installs the production dependencies (`npm ci --omit=dev --ignore-scripts`), because
  `check-api.mjs` reads the products through the shared Zod schema. When it did not, the deploy failed
  with `Cannot find package 'zod'` after M10.
- The deploy job is the only place where the production check runs, and it cannot run on a pull
  request: the first proof of a change to it is the deploy after the merge.
- Rolling back is reverting the commit on `main`; both parts redeploy from the reverted state.
- A change that adds API behaviour the site uses can reach the site first; the post-deploy
  `STRICT_HARDENING=1 npm run check:api` shows whether the API has caught up.

## In the code

`.github/workflows/ci.yml`, `.github/workflows/security.yml`, `render.yaml`, `scripts/check-api.mjs`,
`docs/deployment.md`.
