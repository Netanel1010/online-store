// What a deployed site has to look like, as checks on the answers of its public addresses. It is
// separate from check-site.mjs so it can be tested without a network: check-site.mjs fetches the
// answers and this says what is wrong with them.

import { policyProblems } from './csp.ts'

/**
 * @typedef {{ status: number, type: string, text: string }} Answer
 *
 * @param {object} answers
 * @param {string} answers.base     the site's address with its base path and a closing slash
 * @param {string} answers.sku      the id of a product that the sitemap lists
 * @param {string} [answers.api]    the API the site was built for (the repository variable API_URL);
 *                                  without it, the site is expected to call no API but itself
 * @param {Answer} answers.home     the home page
 * @param {Answer} answers.product  the static page of that product
 * @param {Answer} answers.sitemap  /sitemap.xml
 * @param {Answer} answers.unknown  an address that is not a page
 * @returns {string[]} what is wrong, one sentence each; empty when all is as it should be
 */
export function siteProblems({ base, sku, api, home, product, sitemap, unknown }) {
  const problems = []
  const need = (ok, message) => {
    if (!ok) problems.push(message)
  }
  const isHtml = (answer) => answer.type.toLowerCase().includes('text/html')
  const basePath = new URL(base).pathname
  const productUrl = `${base}products/${sku}/`

  need(home.status === 200, `the home page answers ${home.status}, not 200`)
  need(isHtml(home), 'the home page is not HTML')
  need(
    home.text.includes('<div id="root">'),
    'the home page has no <div id="root"> to mount the app',
  )
  need(
    home.text.includes(`${basePath}assets/`),
    `the home page loads no script or style from ${basePath}assets/ (was the site built with the right base path?)`,
  )

  need(product.status === 200, `the page of product ${sku} answers ${product.status}, not 200`)
  need(isHtml(product), `the page of product ${sku} is not HTML`)
  need(
    product.text.includes(`<link rel="canonical" href="${productUrl}"`),
    `the page of product ${sku} has no canonical address ${productUrl}`,
  )
  need(
    product.text.includes('application/ld+json'),
    `the page of product ${sku} has no structured data`,
  )

  need(sitemap.status === 200, `sitemap.xml answers ${sitemap.status}, not 200`)
  need(sitemap.text.includes('<urlset'), 'sitemap.xml is not a sitemap')
  need(sitemap.text.includes(`<loc>${productUrl}</loc>`), `sitemap.xml does not list ${productUrl}`)

  need(
    unknown.status === 404,
    `an address that is not a page answers ${unknown.status}, not 404 (a crawler would index it)`,
  )
  need(unknown.text.includes('noindex'), 'the page for an unknown address is not marked noindex')

  // Every page is the same template, and the policy is in it: a page without it runs without a policy.
  // It must be the policy of a build for `api`, so a deployed policy that allows any other site (in
  // connect-src, img-src or a directive the site does not have) is reported, not taken for the right shape.
  for (const [name, answer] of [
    ['the home page', home],
    [`the page of product ${sku}`, product],
    ['the page for an unknown address', unknown],
  ]) {
    for (const problem of policyProblems(answer.text, api)) need(false, `${name} ${problem}`)
  }

  return problems
}
