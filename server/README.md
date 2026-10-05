# Online Store API

The backend of the online store: **Node.js**, **Express 5** and **TypeScript**. This is the
foundation only. It has a health check, JSON parsing, CORS, validated configuration and central
error handling. The storefront does not call it yet; products, accounts and orders still live in
the frontend. The database, authentication and orders are added in later steps.

It is an npm workspace of this repository, so one `npm install` at the root installs everything and
the root ESLint, Prettier and TypeScript settings apply to it.

## Run it locally

Requires **Node.js 22.9 or newer** (the repository CI uses 24).

```bash
npm install                 # once, at the repository root
npm run dev:server          # API on http://localhost:3001, restarts on changes
```

```bash
curl http://localhost:3001/api/health
# {"status":"ok","uptime":12,"timestamp":"2026-01-01T12:00:00.000Z"}
```

Run the storefront next to it with `npm run dev`. Its origin (`http://localhost:5173`) is already
allowed by CORS.

Node prints `.env not found. Continuing without it.` when there is no `.env` file. That is fine:
every setting has a development default.

### Scripts

Run from the repository root (or without `:server`, inside `server/`):

| Command                | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev:server`   | Start with auto-reload (`tsx watch`)                 |
| `npm run test:server`  | Run the tests (Vitest, Node environment)             |
| `npm run build:server` | Compile to `server/dist`                             |
| `npm run start:server` | Run the compiled build (`node dist/server.js`)       |
| `npm run typecheck`    | Type-check the site, the tests and the API together  |
| `npm run lint`         | ESLint for the whole repository, API included        |

## Configuration

Settings come from environment variables, validated once at startup (`src/config.ts`): an invalid
value stops the server with a message that names it. Copy [`.env.example`](.env.example) to `.env`
to change them; `.env` is git-ignored.

| Variable       | Default                                          | Meaning                                                                                                   |
| -------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`     | `development`                                    | `development`, `test` or `production`                                                                     |
| `PORT`         | `3001`                                           | Port to listen on                                                                                         |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173`    | Browser origins allowed to call the API, comma separated, with no path. **Required in production.**       |

## Structure

```text
server/
├── src/
│   ├── server.ts        Entry point: reads the config, listens, shuts down on SIGTERM
│   ├── app.ts           createApp(): CORS, JSON parsing, routes, 404, error handler
│   ├── config.ts        Environment variables, validated with Zod
│   ├── routes/          One router per feature, mounted under /api in routes/index.ts
│   ├── middleware/      notFound and the central errorHandler
│   ├── lib/             HttpError, the error a route throws on purpose
│   └── testing/         Test helper that starts an app on a free port
├── tsconfig.json        Type-checking, tests included
└── tsconfig.build.json  Production build to dist/
```

`app.ts` builds the app and `server.ts` listens, so the tests run the real app on a free port
without starting the real server.

## Behaviour worth knowing

- **Errors** always have the same shape: `{ "error": { "code": "not_found", "message": "..." } }`.
  A route throws `new HttpError(status, code, message)` for an expected failure. Any other error is
  logged with its stack and the client only gets `500 internal_error`, so internals never leak.
- **Unknown routes** get a JSON `404`, also outside `/api`, and malformed JSON gets `400 invalid_json`.
- **CORS** is an allow-list. A browser origin that is not listed gets no CORS headers, so the browser
  blocks it. Requests without an `Origin` (curl, server to server) are not affected. Credentials
  are not enabled yet; they are added together with authentication.
- **Request bodies** are limited to 100 kB.
- **Graceful shutdown**: on `SIGTERM` or `SIGINT` the server finishes the requests in progress and
  exits.
