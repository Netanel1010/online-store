## Summary

<!-- What this changes and why, in a few sentences. Write the title and this text in English. -->

## Changes

<!-- The main parts: backend, frontend, tests, docs, configuration. -->

## Tests and checks

<!-- What was run and the result, for example: lint, typecheck, unit and API tests, build, e2e. Say what was NOT run and why. -->

- [ ] `npm run lint`, `npm run typecheck`, `npm run format:check`
- [ ] `npm test`, `npm run test:server` (and `npm run test:integration` if the data layer changed)
- [ ] `npm run build`, `npm run check:bundle`, `npm run build:server`
- [ ] `npm run test:e2e` (if the storefront or the API's behaviour changed)

## Notes

<!-- Limitations, follow-ups, anything a reviewer should know. -->

- [ ] No secret, password or real connection string is in the diff (the fixtures are obviously fake)
- [ ] Documentation updated where behaviour changed
- [ ] Anything that needs a manual step after deploying (a Render setting, a command) is described above
