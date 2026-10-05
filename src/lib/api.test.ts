// The address is read once, when the module loads, so each test loads a fresh copy of it.
async function loadApiUrl() {
  vi.resetModules()
  return (await import('./api')).apiUrl
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('apiUrl', () => {
  it('points at the local API while developing', async () => {
    vi.stubEnv('VITE_API_URL', undefined)
    vi.stubEnv('DEV', true)

    expect((await loadApiUrl())('/api/products')).toBe('http://localhost:3001/api/products')
  })

  it('uses VITE_API_URL, without doubling the slash', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/')

    expect((await loadApiUrl())('/api/products')).toBe('https://api.example.com/api/products')
  })

  it('is relative in a production build with no VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', undefined)
    vi.stubEnv('DEV', false)

    expect((await loadApiUrl())('/api/products')).toBe('/api/products')
  })
})
