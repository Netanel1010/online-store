// The HTTP behaviour of the API that matters to a browser, as checks on the headers of its answers.
// It is separate from check-api.mjs so it can be tested without a server: check-api.mjs fetches the
// answers and this says what is wrong with them.

const includes = (value, text) => (value ?? '').toLowerCase().includes(text.toLowerCase())
const list = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

/**
 * @param {object} answers
 * @param {Headers} answers.product    a successful read of a product, made with the site's Origin
 * @param {Headers} answers.missing    the answer to a product that does not exist
 * @param {Headers} answers.preflight  the answer to the preflight of a sign-in request
 * @param {boolean} answers.https      whether the API was reached over HTTPS
 * @returns {string[]} what is wrong, one sentence each; empty when all is as it should be
 */
export function hardeningProblems({ product, missing, preflight, https }) {
  const problems = []
  const need = (ok, message) => {
    if (!ok) problems.push(message)
  }

  need(
    product.get('x-content-type-options') === 'nosniff',
    'answers lack X-Content-Type-Options: nosniff',
  )
  need(
    product.get('referrer-policy') === 'no-referrer',
    'answers lack Referrer-Policy: no-referrer',
  )
  need(
    includes(product.get('content-security-policy'), "frame-ancestors 'none'"),
    "answers lack a Content-Security-Policy with frame-ancestors 'none'",
  )
  need(product.get('x-powered-by') === null, 'answers name the framework (X-Powered-By)')
  if (https) {
    need(
      includes(product.get('strict-transport-security'), 'max-age='),
      'answers over HTTPS lack Strict-Transport-Security',
    )
  }
  need(
    includes(product.get('cache-control'), 'max-age=') &&
      includes(product.get('cache-control'), 'stale-while-revalidate='),
    'a product read lacks Cache-Control with max-age and stale-while-revalidate',
  )
  need(
    list(product.get('access-control-expose-headers')).includes('retry-after'),
    'CORS does not let the site read Retry-After',
  )

  need(
    missing.get('cache-control') === 'no-store',
    'an error answer is not marked Cache-Control: no-store',
  )

  const methods = list(preflight.get('access-control-allow-methods'))
  need(
    methods.includes('post') && methods.includes('get'),
    'the preflight does not allow the GET and POST the site uses',
  )
  need(
    !methods.some((method) => ['put', 'patch', 'delete'].includes(method)),
    'the preflight allows PUT, PATCH or DELETE, which the site never uses',
  )
  need(
    list(preflight.get('access-control-allow-headers')).includes('authorization'),
    'the preflight does not allow the Authorization header',
  )
  need(
    Number(preflight.get('access-control-max-age')) >= 60,
    'the preflight answer is not cached (Access-Control-Max-Age)',
  )
  return problems
}
