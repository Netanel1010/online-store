import { endAllSessions } from './authService'

const API = 'http://localhost:3001'
const TOKEN = 'T'.repeat(43)

function stubFetch(answer: () => Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(answer()))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('endAllSessions', () => {
  it('asks the API with the token as a Bearer token, never in the address, and no body', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }))

    await endAllSessions(TOKEN)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${API}/api/auth/logout-all`)
    expect(init).toMatchObject({ method: 'POST' })
    expect(init?.headers).toEqual({ Authorization: `Bearer ${TOKEN}` })
    expect(init?.body).toBeUndefined()
  })

  it('says "ended" when the API ended the sessions', async () => {
    stubFetch(() => new Response(null, { status: 204 }))

    expect(await endAllSessions(TOKEN)).toBe('ended')
  })

  it('says "already-over" when the API no longer knows the token: this browser has nothing left to end', async () => {
    stubFetch(() =>
      Response.json({ error: { code: 'unauthorized', message: 'x' } }, { status: 401 }),
    )

    expect(await endAllSessions(TOKEN)).toBe('already-over')
  })

  it.each([400, 404, 429, 500, 503])(
    'says "unavailable" for a %i: nothing is known to have ended',
    async (status) => {
      stubFetch(() => Response.json({}, { status }))

      expect(await endAllSessions(TOKEN)).toBe('unavailable')
    },
  )

  it('says "unavailable", and does not throw, when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))

    expect(await endAllSessions(TOKEN)).toBe('unavailable')
  })
})
