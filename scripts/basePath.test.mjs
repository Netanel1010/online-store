import { DEFAULT_BASE_PATH, resolveBasePath } from './basePath.ts'

describe('resolveBasePath', () => {
  it('is the GitHub Pages path unless something else is asked for', () => {
    expect(DEFAULT_BASE_PATH).toBe('/online-store/')
    expect(resolveBasePath(undefined)).toBe('/online-store/')
    expect(resolveBasePath('')).toBe('/online-store/')
    expect(resolveBasePath('   ')).toBe('/online-store/')
  })

  it('accepts the root, for a host that serves the site at the root of its address', () => {
    expect(resolveBasePath('/')).toBe('/')
  })

  it('accepts a path that starts and ends with a slash', () => {
    expect(resolveBasePath('/online-store/')).toBe('/online-store/')
    expect(resolveBasePath('/shop/v2/')).toBe('/shop/v2/')
    expect(resolveBasePath(' /shop/ ')).toBe('/shop/')
  })

  it.each([
    'online-store/',
    '/online-store',
    'online-store',
    '//',
    '/a//b/',
    '/../',
    '/a b/',
    'https://example.com/',
    './',
  ])('refuses %j, which would build a site whose assets do not load', (value) => {
    expect(() => resolveBasePath(value)).toThrow(/VITE_BASE_PATH must be/)
  })
})
