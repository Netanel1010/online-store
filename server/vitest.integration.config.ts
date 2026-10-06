import { defineConfig } from 'vitest/config'

const uri = process.env.MONGODB_TEST_URI

// This run exists to test against a real MongoDB, so it must never "pass" by skipping them: without
// an address it stops here instead (the same tests are skipped by `npm run test:server`, which is
// meant to be quick and to need nothing).
if (!uri) {
  throw new Error(
    'MONGODB_TEST_URI is required for the integration tests, for example ' +
      'MONGODB_TEST_URI=mongodb://localhost:27017 npm run test:integration',
  )
}

// The tests make a database of their own with a random name and drop it, and never touch the
// products or the accounts of any other database. Even so, a shared or production cluster is not
// a place to run them by accident: an Atlas address needs to be allowed on purpose.
if (/^mongodb\+srv:\/\//i.test(uri) || /\.mongodb\.net\b/i.test(uri)) {
  if (process.env.MONGODB_TEST_ALLOW_ATLAS !== '1') {
    throw new Error(
      'MONGODB_TEST_URI points at MongoDB Atlas. The integration tests only use databases named ' +
        'online_store_test_<random>, but run them there on purpose: set MONGODB_TEST_ALLOW_ATLAS=1. ' +
        'In CI they run against a throwaway MongoDB that exists only for the job.',
    )
  }
}

export default defineConfig({
  test: {
    pool: 'threads',
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // A real server answers in milliseconds, but an Atlas cluster that has to be reached over the
    // internet (when run on purpose from a laptop) can take seconds to connect.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // There is nothing to run if no test file matches: that is a failure, not a pass.
    passWithNoTests: false,
  },
})
