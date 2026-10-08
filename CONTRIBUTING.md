# Contributing

This is a portfolio project with one maintainer, but it is run like a team project, and a change is
welcome if it follows the same path.

1. **Read first:** the [README](README.md) for what the store is and is not, and the
   [developer guide](docs/development.md) for setup, conventions and the common tasks.
2. **Work on a branch**, not on `main`. Commit messages look like `feat: …`, `fix: …`, `docs: …`,
   `chore: …`.
3. **Run the checks that match your change** (the table in
   [Before you push](docs/development.md#before-you-push)). CI runs all of them on the pull request,
   and `main` is only deployed when they pass.
4. **Open a pull request** in English and fill in
   [the template](.github/pull_request_template.md): what changed, which checks were run and which
   were not, and a note about anything that needs a manual step after deploying.
5. **Keep the documentation true.** A change to behaviour updates the document that describes it, a
   change to an endpoint updates [`docs/openapi.yaml`](docs/openapi.yaml) and
   [`server/README.md`](server/README.md), and a change to a decision in [`docs/adr/`](docs/adr/README.md)
   updates or adds a record.
6. **Never commit a secret.** The database connection string lives in the Render dashboard and in a
   git-ignored `server/.env`. A repository test fails if a credential-shaped string is tracked.

Reporting a security problem: do not open a public issue with the details; see the
[security policy](SECURITY.md).

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
