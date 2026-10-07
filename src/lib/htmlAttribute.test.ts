import { escapeHtmlAttribute } from './htmlAttribute'

describe('escapeHtmlAttribute', () => {
  it('escapes every ampersand, not only the first', () => {
    expect(escapeHtmlAttribute('/api/products?page=1&limit=100&sort=a&x=y')).toBe(
      '/api/products?page=1&amp;limit=100&amp;sort=a&amp;x=y',
    )
  })

  it('escapes the characters that could end the attribute or open a tag', () => {
    expect(escapeHtmlAttribute(`"><script>'`)).toBe('&quot;&gt;&lt;script&gt;&#39;')
  })

  it('leaves a plain address as it is', () => {
    expect(escapeHtmlAttribute('/api/products')).toBe('/api/products')
  })
})
