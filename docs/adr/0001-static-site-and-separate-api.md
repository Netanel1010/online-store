# 0001. A static site on GitHub Pages and an API on Render, deployed separately

**Status:** Accepted

## Context

The store started as a static HTML/CSS/JavaScript site and was rebuilt as a React single-page app
hosted on GitHub Pages. Pages serves files only, so anything with accounts, a cart or orders needs a
program of its own, with a database.

## Decision

- The **site** stays a static build on GitHub Pages.
- The **API** is an Express program in `server/`, run as a Render web service (free plan, Frankfurt,
  built from the repository without Docker) and described by `render.yaml`.
- The **data** is in MongoDB Atlas, reached only by the API.
- Each part is deployed on its own. The site learns the API's address when it is built
  (`VITE_API_URL`, from the repository variable `API_URL`), and the API learns which site may call it
  from `CORS_ORIGINS`.

## Consequences

- The site and the API are different origins, so every call is a cross-origin call: CORS is an
  allow-list, and sessions use a header instead of cookies ([0002](0002-bearer-tokens-not-cookies.md)).
- A free Render service sleeps when idle, so the first request after a pause takes about 30 to 60
  seconds. The site softens it with a preconnect, retries (`fetchWithRetry`), an explanation on slow
  listings and cacheable product reads; it cannot remove it.
- The two deployments are independent, so a change that adds API behaviour the site starts to use can
  reach the site first. [0011](0011-one-workflow-gates-both-deployments.md) and the
  [deployment guide](../deployment.md#how-a-change-reaches-production) say how that is handled.
- Pages cannot rewrite unknown paths: the build writes a `404.html` fallback and a real HTML file per
  indexable page ([SEO](../seo.md)). Pages cannot send response headers either, so the site has no CSP.
- Moving the site to another address means changing `CORS_ORIGINS` and `SITE_URL`.

## In the code

`render.yaml`, `.github/workflows/ci.yml`, `src/lib/api.ts`, `scripts/spa-fallback.mjs`,
`docs/deployment.md`.
