// The weight of what the home page loads before the app can start, as a budget. It is separate from
// check-bundle.mjs so it can be tested without a build: check-bundle.mjs reads the built files and
// this says which ones the page loads and whether they fit.

/**
 * What the visitor's first page costs, in bytes after gzip (what GitHub Pages sends), with about
 * 20% room over the build of M12 (JavaScript 133 KiB, CSS 7.7 KiB). A page that is lazy-loaded
 * (the form pages, the orders) does not count: only what `index.html` asks for up front does.
 */
export const BUDGET = {
  javascript: 160 * 1024,
  stylesheet: 16 * 1024,
}

/**
 * The files `index.html` loads up front: the entry script, the preloaded chunks and the stylesheets.
 * @param {string} html  the built index.html
 * @param {string} base  the base path of the site, such as /online-store/
 * @returns {{ path: string, kind: 'javascript' | 'stylesheet' }[]} paths relative to dist/
 */
export function initialAssets(html, base) {
  const prefix = base.endsWith('/') ? base : `${base}/`
  const found = new Map()
  // HTML tag and attribute names, and the value of `rel`, are case-insensitive.
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    const url = /\b(?:src|href)="([^"]+)"/i.exec(tag)?.[1]
    if (!url?.startsWith(prefix)) continue
    const path = url.slice(prefix.length)
    if (/^<script\b/i.test(tag) || /rel="modulepreload"/i.test(tag)) {
      if (path.endsWith('.js')) found.set(path, 'javascript')
    } else if (/rel="stylesheet"/i.test(tag) && path.endsWith('.css')) {
      found.set(path, 'stylesheet')
    }
  }
  return [...found].map(([path, kind]) => ({ path, kind }))
}

/**
 * @param {{ kind: 'javascript' | 'stylesheet', bytes: number }[]} files  gzip sizes of the initial files
 * @param {typeof BUDGET} budget
 * @returns {string[]} what is over budget, one sentence each; empty when all fits
 */
export function budgetProblems(files, budget = BUDGET) {
  const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`
  const problems = []
  for (const kind of /** @type {const} */ (['javascript', 'stylesheet'])) {
    const own = files.filter((file) => file.kind === kind)
    const total = own.reduce((sum, file) => sum + file.bytes, 0)
    if (own.length === 0)
      problems.push(`the home page loads no ${kind} up front (is the build empty?)`)
    else if (total > budget[kind]) {
      problems.push(
        `the ${kind} loaded up front is ${kib(total)} gzipped, over the budget of ${kib(budget[kind])}`,
      )
    }
  }
  return problems
}
