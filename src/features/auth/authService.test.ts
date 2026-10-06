import {
  endSession,
  fetchCurrentUser,
  loginAccount,
  registerAccount,
  type SignedIn,
} from './authService'

const API = 'http://localhost:3001'
const TOKEN = 'T'.repeat(43)
const signedIn: SignedIn = {
  user: { id: 'u1', name: 'נתנאל', email: 'netanel@example.com' },
  token: TOKEN,
  expiresAt: '2026-01-08T10:00:00.000Z',
}

function stubFetch(answer: () => Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(answer()))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const failWith = (error: Error) => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registerAccount', () => {
  const input = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }

  it('posts the details as JSON to the API, with no cookies and no token', async () => {
    const fetchMock = stubFetch(() => Response.json(signedIn, { status: 201 }))

    const outcome = await registerAccount(input)

    expect(outcome).toEqual({ ok: true, value: signedIn })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${API}/api/auth/register`)
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(input) })
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init?.credentials).toBeUndefined()
  })

  it('puts nothing of the details in the address', async () => {
    const fetchMock = stubFetch(() => Response.json(signedIn, { status: 201 }))

    await registerAccount(input)

    expect(String(fetchMock.mock.calls[0]![0])).not.toMatch(/Passw0rd|netanel|\?/)
  })

  it.each([
    [409, 'email-taken'],
    [400, 'invalid-input'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [404, 'unavailable'],
  ])('maps a %i answer to "%s"', async (status, reason) => {
    stubFetch(() => Response.json({ error: { code: 'x', message: 'y' } }, { status }))

    expect(await registerAccount(input)).toEqual({ ok: false, reason })
  })

  it('is unavailable when the API cannot be reached', async () => {
    failWith(new TypeError('network down'))

    expect(await registerAccount(input)).toEqual({ ok: false, reason: 'unavailable' })
  })

  it.each([
    ['text', () => new Response('<html>', { status: 201 })],
    ['no token', () => Response.json({ user: signedIn.user, expiresAt: signedIn.expiresAt })],
    ['a short token', () => Response.json({ ...signedIn, token: 'x' })],
    ['no user', () => Response.json({ token: TOKEN, expiresAt: signedIn.expiresAt })],
    ['a bad date', () => Response.json({ ...signedIn, expiresAt: 'tomorrow' })],
  ])('is unavailable when the answer is %s', async (_name, answer) => {
    stubFetch(answer)

    expect(await registerAccount(input)).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('loginAccount', () => {
  const input = { email: 'netanel@example.com', password: 'Passw0rdOK' }

  it('posts the credentials and returns the session', async () => {
    const fetchMock = stubFetch(() => Response.json(signedIn))

    expect(await loginAccount(input)).toEqual({ ok: true, value: signedIn })
    expect(fetchMock.mock.calls[0]![0]).toBe(`${API}/api/auth/login`)
  })

  it.each([
    [401, 'invalid-credentials'],
    [429, 'too-many-attempts'],
    [400, 'invalid-input'],
    [500, 'unavailable'],
    [409, 'unavailable'],
  ])('maps a %i answer to "%s"', async (status, reason) => {
    stubFetch(() => Response.json({ error: { code: 'x', message: 'y' } }, { status }))

    expect(await loginAccount(input)).toEqual({ ok: false, reason })
  })

  it('is unavailable when the API cannot be reached', async () => {
    failWith(new TypeError('network down'))

    expect(await loginAccount(input)).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('endSession', () => {
  it('sends the token to the API as a Bearer token, never in the address', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }))

    await endSession(TOKEN)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${API}/api/auth/logout`)
    expect(init).toMatchObject({ method: 'POST' })
    expect(init?.headers).toEqual({ Authorization: `Bearer ${TOKEN}` })
  })

  it('does not fail when the API cannot be reached or refuses', async () => {
    failWith(new TypeError('network down'))
    await expect(endSession(TOKEN)).resolves.toBeUndefined()

    stubFetch(() => Response.json({}, { status: 500 }))
    await expect(endSession(TOKEN)).resolves.toBeUndefined()
  })
})

describe('fetchCurrentUser', () => {
  it('asks the API who the token belongs to, with the token as a Bearer token', async () => {
    const fetchMock = stubFetch(() => Response.json({ user: signedIn.user }))

    expect(await fetchCurrentUser(TOKEN)).toEqual({ status: 'signed-in', user: signedIn.user })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${API}/api/auth/me`)
    expect(init?.headers).toEqual({ Authorization: `Bearer ${TOKEN}` })
  })

  it('passes the abort signal on', async () => {
    const controller = new AbortController()
    const fetchMock = stubFetch(() => Response.json({ user: signedIn.user }))

    await fetchCurrentUser(TOKEN, controller.signal)

    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ signal: controller.signal })
  })

  it('is signed-out when the API does not know the token (401)', async () => {
    stubFetch(() =>
      Response.json({ error: { code: 'unauthorized', message: 'x' } }, { status: 401 }),
    )

    expect(await fetchCurrentUser(TOKEN)).toEqual({ status: 'signed-out' })
  })

  it.each([
    ['a server error', () => Response.json({}, { status: 500 })],
    ['no database', () => Response.json({}, { status: 503 })],
    ['a 403', () => Response.json({}, { status: 403 })],
    ['text', () => new Response('<html>')],
    ['an answer without a user', () => Response.json({ nope: true })],
  ])(
    'is unavailable, not signed-out, for %s: nothing was said about the account',
    async (_n, answer) => {
      stubFetch(answer)

      expect(await fetchCurrentUser(TOKEN)).toEqual({ status: 'unavailable' })
    },
  )

  it('is unavailable when the API cannot be reached', async () => {
    failWith(new TypeError('network down'))

    expect(await fetchCurrentUser(TOKEN)).toEqual({ status: 'unavailable' })
  })
})
