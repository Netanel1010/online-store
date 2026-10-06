// Strings that look like a real credential, found in text. It is a safety net against committing a
// secret by accident and against fixtures that a secret scanner would report (GitHub reported a fake
// MongoDB Atlas address in a test once): test data that needs a password uses an obviously fake one
// and a host that cannot exist (`.invalid`). Placeholders such as `<user>:<password>` are fine.
//
// The patterns are built from parts so that this file does not contain what it looks for.

const PART = '[^\\s/@:<>\'"`]'

/** @type {{ name: string; pattern: RegExp }[]} */
const SHAPES = [
  {
    name: 'a MongoDB Atlas connection string with a user and a password',
    pattern: new RegExp(`mongodb(\\+srv)?://${PART}+:${PART}+@[^\\s'"\`/]*mongodb\\.net`, 'i'),
  },
  { name: 'an AWS access key id', pattern: new RegExp('\\b' + 'AKIA' + '[0-9A-Z]{16}\\b') },
  { name: 'a GitHub token', pattern: new RegExp('\\bgh[pousr]_' + '[A-Za-z0-9]{30,}') },
  { name: 'a Slack token', pattern: new RegExp('\\bxox[baprs]-' + '[A-Za-z0-9-]{10,}') },
  { name: 'a live Stripe key', pattern: new RegExp('\\b[sr]k_live_' + '[A-Za-z0-9]{10,}') },
  {
    name: 'a private key',
    pattern: new RegExp('-----BEGIN [A-Z ]*PRIVATE ' + 'KEY-----'),
  },
]

/**
 * @param {string} text
 * @returns {string[]} what was found, by name (never the value: it may be a secret)
 */
export function findSecretShapes(text) {
  return SHAPES.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name)
}
