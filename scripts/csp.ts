/**
 * The Content-Security-Policy of the site, in one place for everything that needs it: the build, which
 * writes it into every page as a `<meta>` tag (vite.config.ts), the check of the build
 * (scripts/check-csp.mjs), the check of the deployed site (scripts/siteSmoke.mjs) and the tests.
 *
 * What the site needs, and so all that it is allowed: its own scripts and style sheet (`script-src` and
 * `style-src` are `'self'`, with no `'unsafe-inline'` and no `'unsafe-eval'`), its own images, and
 * requests to its own address and to the API. Nothing else loads: no font, no frame, no object, no
 * worker, no media, and no image from another site or from a `data:` address. The one inline script of a
 * page is `application/ld+json`, a block of data that a browser does not run and a policy does not
 * govern. A form may only be sent to the site itself, and `<base>` may not be used.
 *
 * The address of the API comes from `VITE_API_URL`, the variable the build already reads for the app's
 * own requests (`apiUrl`) and for the connection hint (`apiHints`), so the policy and the app cannot
 * name different APIs. Without it (the API on the site's own host) `'self'` is all there is.
 *
 * A `<meta>` tag carries part of a policy. `frame-ancestors`, `report-uri` and `sandbox` are ignored in
 * it (a browser reports it in the console), so they are not in it, and the protection they give (a page
 * that cannot be put in a frame) is there only where the host can send a header: see
 * `contentSecurityPolicyHeader` and docs/adr/0012-security-headers-for-the-static-site.md.
 */

const SELF = "'self'"
const NONE = "'none'"

/**
 * The address (scheme, host and port) of the API, from the value of `VITE_API_URL`, or undefined when
 * there is none or it is not an http or https address. Only an origin is ever used: what follows it (a
 * path, a trailing slash, credentials) is dropped.
 */
export function apiOrigin(apiUrl: string | undefined): string | undefined {
  const base = apiUrl?.trim().replace(/\/+$/, '')
  if (!base || !URL.canParse(base)) return undefined
  const url = new URL(base)
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined
}

/** The policy that goes in the `<meta>` tag of every page: the directives that a tag can carry. */
export function contentSecurityPolicy(apiUrl: string | undefined): string {
  const origin = apiOrigin(apiUrl)
  return [
    `default-src ${NONE}`,
    `script-src ${SELF}`,
    `style-src ${SELF}`,
    `img-src ${SELF}`,
    `connect-src ${origin ? `${SELF} ${origin}` : SELF}`,
    `base-uri ${NONE}`,
    `form-action ${SELF}`,
  ].join('; ')
}

/** What only a response header can say: that no page may put the site in a frame. */
export const HEADER_ONLY_DIRECTIVES = "frame-ancestors 'none'"

/** The same policy as an HTTP header, for a host that can send one (Netlify): the tag's directives and the header-only ones. */
export function contentSecurityPolicyHeader(apiUrl: string | undefined): string {
  return `${contentSecurityPolicy(apiUrl)}; ${HEADER_ONLY_DIRECTIVES}`
}

/** The `<meta>` tag with the policy. A policy holds no `"` or `&`, which would need escaping in an attribute. */
export function contentSecurityPolicyTag(apiUrl: string | undefined): string {
  return `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(apiUrl)}" />`
}

const POLICY_TAG = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/gi

/** The policies that the `<meta>` tags of a page carry, in the order they appear. */
export function policiesOfPage(html: string): string[] {
  return [...html.matchAll(POLICY_TAG)].map((match) => match[1]!)
}

/** The directives of a policy, by name. */
export function directivesOf(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/)
    if (name) directives.set(name.toLowerCase(), values)
  }
  return directives
}

/**
 * What is wrong with the policy of a page, one sentence each; empty when the page has exactly one tag
 * with `expected`. `expected` is undefined when only the shape of the policy is known (a deployed site,
 * whose build this check did not see): then the page must have a policy that allows scripts from the
 * site only, and nothing unsafe.
 */
export function policyProblems(html: string, expected?: string): string[] {
  const policies = policiesOfPage(html)
  if (policies.length === 0) return ['has no Content-Security-Policy tag']
  if (policies.length > 1) return [`has ${policies.length} Content-Security-Policy tags, not one`]

  const policy = policies[0]!
  const problems: string[] = []
  if (expected !== undefined && policy !== expected) {
    problems.push(`has a policy that is not the one of this build (${policy})`)
  }
  const directives = directivesOf(policy)
  if (directives.get('default-src')?.join(' ') !== NONE) {
    problems.push("does not start from default-src 'none'")
  }
  if (directives.get('script-src')?.join(' ') !== SELF) {
    problems.push("allows scripts from somewhere else than 'self'")
  }
  if (/'unsafe-(?:inline|eval)'|\*|\bdata:|\bblob:|\bhttps?:(?=\s|;|$)/i.test(policy)) {
    problems.push(
      'allows something unsafe or too broad (unsafe-inline, unsafe-eval, *, data:, blob: or a whole scheme)',
    )
  }
  if (
    directives.has('frame-ancestors') ||
    directives.has('report-uri') ||
    directives.has('sandbox')
  ) {
    problems.push('has a directive that a <meta> tag cannot carry')
  }
  return problems
}
