/**
 * The Content-Security-Policy of the site, in one place for everything that needs it: the build, which
 * writes it into every page as a `<meta>` tag (vite.config.ts), the check of the build
 * (scripts/check-csp.mjs), the check of the deployed site (scripts/siteSmoke.mjs) and the tests. Both
 * checks hold a page to the policy of a build for a known API (`policyProblems`), not to its shape alone.
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
 * `contentSecurityPolicyHeader` and docs/adr/0013-csp-in-a-tag-and-favorites-for-each-person.md.
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

/** A comment, whose tags a browser does not read. */
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g

/**
 * The start of an element that loads something, or of the body. A policy in a `<meta>` tag governs only
 * what comes after it, and a browser ignores the tag in the body, so the tag must come before all of them.
 */
const LOADS_OR_BODY = /<(?:script|link|style|img|iframe|object|embed|base|body)\b/i

const META_ONLY_IGNORES = ['frame-ancestors', 'report-uri', 'sandbox']

/** The policies that the `<meta>` tags of a page carry, in the order they appear (not in a comment). */
export function policiesOfPage(html: string): string[] {
  return [...html.replace(COMMENT, '').matchAll(POLICY_TAG)].map((match) => match[1]!)
}

/** The parts of a policy, as `[name, sources]`, in their order, names in lower case. */
function partsOf(policy: string): [string, string[]][] {
  return policy.split(';').flatMap((part): [string, string[]][] => {
    const [name, ...values] = part.trim().split(/\s+/)
    return name ? [[name.toLowerCase(), values]] : []
  })
}

/** The directives of a policy, by name. A directive that comes again is ignored, as a browser ignores it. */
export function directivesOf(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const [name, values] of partsOf(policy)) {
    if (!directives.has(name)) directives.set(name, values)
  }
  return directives
}

/**
 * What is wrong with the policy of a page, one sentence each; empty when the page has exactly one tag,
 * before anything that loads, with the policy of a build for the API at `apiUrl` (`contentSecurityPolicy`).
 *
 * `apiUrl` is the API that the build was made for: `VITE_API_URL` for the check of the build, the
 * repository variable `API_URL` for the check of a deployed site. Undefined means no API but the site
 * itself. The page may allow exactly what that policy allows: every directive of it, no other, and no
 * source that it does not name, so a deployed policy cannot be loosened (another site in `connect-src` or
 * `img-src`, a directive for fonts or frames) without this saying so. A few checks stand on their own,
 * whatever `contentSecurityPolicy` says, so that loosening it too is not enough: the policy starts from
 * `default-src 'none'`, scripts come from the site only, and nothing unsafe or broad is allowed.
 */
export function policyProblems(html: string, apiUrl: string | undefined): string[] {
  const page = html.replace(COMMENT, '')
  const policies = policiesOfPage(page)
  if (policies.length === 0) return ['has no Content-Security-Policy tag']
  if (policies.length > 1) return [`has ${policies.length} Content-Security-Policy tags, not one`]

  const policy = policies[0]!
  const expected = contentSecurityPolicy(apiUrl)
  const problems: string[] = []
  const loads = page.search(LOADS_OR_BODY)
  if (loads !== -1 && loads < page.search(POLICY_TAG)) {
    problems.push(
      'has its Content-Security-Policy tag after something that loads, or in the body, and what comes before it runs without the policy',
    )
  }

  const directives = directivesOf(policy)
  if (directives.get('default-src')?.join(' ') !== NONE) {
    problems.push("does not start from default-src 'none'")
  }
  if (directives.get('script-src')?.join(' ') !== SELF) {
    problems.push("allows scripts from somewhere else than 'self'")
  }
  if (/unsafe-|\*|\bdata:|\bblob:|\bhttps?:(?=\s|;|$)/i.test(policy)) {
    problems.push(
      'allows something unsafe or too broad (unsafe-inline, unsafe-eval, *, data:, blob: or a whole scheme)',
    )
  }
  if (META_ONLY_IGNORES.some((name) => directives.has(name))) {
    problems.push('has a directive that a <meta> tag cannot carry')
  }

  const counts = new Map<string, number>()
  for (const [name] of partsOf(policy)) counts.set(name, (counts.get(name) ?? 0) + 1)
  for (const [name, count] of counts) {
    if (count > 1) problems.push(`has ${name} more than once (a browser uses the first)`)
  }

  const allowed = directivesOf(expected)
  const which = apiOrigin(apiUrl) ?? 'none but the site itself'
  for (const [name, values] of directives) {
    const permitted = allowed.get(name)
    if (!permitted) {
      if (!META_ONLY_IGNORES.includes(name)) {
        problems.push(`has ${name}, which the policy of the site does not have`)
      }
      continue
    }
    for (const value of values.map((value) => value.toLowerCase())) {
      if (!permitted.includes(value)) {
        problems.push(
          name === 'connect-src'
            ? `allows ${value} in connect-src, which is not the site or its API (the API checked for: ${which}; is API_URL the API the site was built for?)`
            : `allows ${value} in ${name}, which the policy of the site does not`,
        )
      }
    }
  }
  for (const [name, values] of allowed) {
    const present = directives.get(name)?.map((value) => value.toLowerCase())
    if (!present) {
      problems.push(`has no ${name}`)
      continue
    }
    for (const value of values) {
      if (!present.includes(value)) problems.push(`does not allow ${value} in ${name}`)
    }
  }

  if (problems.length === 0 && policy !== expected) {
    problems.push(
      `has a policy that says the same but is not written as the site writes it (${policy})`,
    )
  }
  return problems
}
