import toml from '../netlify.toml?raw'
import {
  HEADER_ONLY_DIRECTIVES,
  apiOrigin,
  contentSecurityPolicy,
  contentSecurityPolicyHeader,
  directivesOf,
} from './csp.ts'

/**
 * netlify.toml sends the security headers of the site on Netlify (GitHub Pages cannot send any). They
 * are written out in the file, because TOML cannot read the build's variables, so this test is what
 * keeps them equal to the policy of the build (scripts/csp.ts) and to the API that the same file builds
 * the site for. The file is read as text, with a reader for the part of TOML that it uses: there is no
 * TOML dependency in the project, and a test is not a reason to add one.
 */

interface HeaderBlock {
  for: string
  values: Record<string, string>
}

function headerBlocks(text: string): HeaderBlock[] {
  const blocks: HeaderBlock[] = []
  let current: HeaderBlock | null = null
  let inValues = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '[[headers]]') {
      current = { for: '', values: {} }
      blocks.push(current)
      inValues = false
    } else if (line === '[headers.values]') {
      inValues = true
    } else if (line.startsWith('[')) {
      current = null
      inValues = false
    } else if (current) {
      const match = /^([A-Za-z0-9_-]+)\s*=\s*"(.*)"\s*$/.exec(line)
      if (!match) continue
      if (inValues) current.values[match[1]!] = match[2]!
      else if (match[1] === 'for') current.for = match[2]!
    }
  }
  return blocks
}

const blocks = headerBlocks(toml)
const everything = blocks.find((block) => block.for === '/*')!
const values = everything?.values ?? {}
const buildApi = /^\s*VITE_API_URL\s*=\s*"([^"]+)"/m.exec(toml)?.[1]

describe('the reader of netlify.toml', () => {
  it('finds the one block of headers, for every path, and the API that the site is built for', () => {
    expect(blocks).toHaveLength(1)
    expect(everything).toBeDefined()
    expect(Object.keys(values).length).toBeGreaterThanOrEqual(5)
    expect(buildApi).toMatch(/^https:\/\//)
  })
})

describe('the headers of the site on Netlify', () => {
  it('send the policy of the build for the API of the build, and the rule that only a header can carry', () => {
    expect(values['Content-Security-Policy']).toBe(contentSecurityPolicyHeader(buildApi))
  })

  it('are the tag of the pages and nothing more than the frame rule', () => {
    const header = directivesOf(values['Content-Security-Policy']!)
    expect(header.get('frame-ancestors')).toEqual(["'none'"])
    expect(HEADER_ONLY_DIRECTIVES).toBe("frame-ancestors 'none'")
    header.delete('frame-ancestors')

    expect(header).toEqual(directivesOf(contentSecurityPolicy(buildApi)))
  })

  it('name the API that the file builds the site for, as an origin, and no other place', () => {
    const connect = directivesOf(values['Content-Security-Policy']!).get('connect-src')

    expect(connect).toEqual(["'self'", apiOrigin(buildApi)])
    expect(values['Content-Security-Policy']).not.toMatch(/unsafe-|\*|data:|blob:/)
  })

  it('stop the browser from guessing types, from framing the site, and from sending the address on', () => {
    expect(values['X-Content-Type-Options']).toBe('nosniff')
    expect(values['X-Frame-Options']).toBe('DENY')
    expect(values['Referrer-Policy']).toBe('no-referrer')
  })

  it('turn off the features of the browser that the site does not use', () => {
    const policy = values['Permissions-Policy']!
    for (const feature of ['camera', 'microphone', 'geolocation', 'usb']) {
      expect(policy, feature).toContain(`${feature}=()`)
    }
  })
})
