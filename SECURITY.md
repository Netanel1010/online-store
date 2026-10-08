# Security Policy

## Supported versions

This is a portfolio project with one maintainer. Only the latest commit on `main` is supported, and it
is the one that is deployed. There are no release branches.

## Reporting a vulnerability

Please **do not open a public issue** with the details of a security problem.

Report it privately, in one of these ways:

- Through GitHub's [private vulnerability reporting](https://github.com/Netanel1010/online-store/security/advisories/new)
  (the **Security** tab, then **Report a vulnerability**).
- Or by contacting the maintainer through their [GitHub profile](https://github.com/Netanel1010).

Please include what you found, the steps to reproduce it and what it could affect.

## What to expect

This is a one-person project, so there is no response time and no bug bounty. Reports are read and
handled on a best-effort basis, as the [MIT License](LICENSE) says: the software is provided "as is".

## Scope

In scope: the code in this repository, the live site and the production API it uses.

Please:

- use only accounts and data that you created yourself;
- do not run load or denial-of-service tests: the API runs on a free hosting plan.

Not security problems, and so not for this channel:

- Accessibility problems. The site's accessibility statement (the `/accessibility` page, described in
  [`docs/accessibility.md`](docs/accessibility.md)) says how to report them.
- Payments and shipping. Orders are demo orders: nothing is charged, shipped or emailed.
- Limits that are already documented, such as the in-memory rate limits described in
  [ADR 0010](docs/adr/0010-in-house-limits-and-headers.md) and the
  [scope and limitations](README.md#features) of the README.

How security is built, and why: [`docs/architecture.md`](docs/architecture.md) and the
[decision records](docs/adr/README.md).
