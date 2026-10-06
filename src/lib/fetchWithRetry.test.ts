import { fetchPolicy, fetchWithRetry } from './fetchWithRetry'

const URL_ = 'https://api.example.com/api/products'
const ok = () => new Response('{}', { status: 200 })
const status = (code: number) => new Response('{}', { status: code })

const original = { ...fetchPolicy, delaysMs: [...fetchPolicy.delaysMs] }

beforeEach(() => {
  vi.useFakeTimers()
  fetchPolicy.delaysMs = [1_000, 3_000]
  fetchPolicy.attemptTimeoutMs = 30_000
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetchPolicy.delaysMs = original.delaysMs
  fetchPolicy.attemptTimeoutMs = original.attemptTimeoutMs
})

function stubFetch(...answers: (() => Response | Promise<Response>)[]) {
  const fetchMock = vi.fn()
  answers.forEach((answer) => fetchMock.mockImplementationOnce(async () => answer()))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fetchWithRetry', () => {
  it('answers at once, without any pause, when the first attempt works', async () => {
    const fetchMock = stubFetch(ok)

    const response = await fetchWithRetry(URL_)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([502, 503, 504])(
    'tries again after a %i, which a host that is waking up answers',
    async (code) => {
      const fetchMock = stubFetch(() => status(code), ok)

      const pending = fetchWithRetry(URL_)
      await vi.advanceTimersByTimeAsync(999)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)

      expect((await pending).status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it('tries again after a connection failure, with a longer pause the second time', async () => {
    const fail = () => Promise.reject(new TypeError('Failed to fetch'))
    const fetchMock = stubFetch(fail, fail, ok)

    const pending = fetchWithRetry(URL_)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2_999)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)

    expect((await pending).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('gives up after the last attempt and throws the last failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const pending = fetchWithRetry(URL_)
    const outcome = expect(pending).rejects.toThrow('Failed to fetch')
    await vi.advanceTimersByTimeAsync(4_000)

    await outcome
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('returns the last answer when every attempt is a gateway error, so the caller can report it', async () => {
    const fetchMock = stubFetch(
      () => status(503),
      () => status(503),
      () => status(503),
    )

    const pending = fetchWithRetry(URL_)
    await vi.advanceTimersByTimeAsync(4_000)

    expect((await pending).status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it.each([400, 404, 500])('does not repeat a request that is answered with %i', async (code) => {
    const fetchMock = stubFetch(() => status(code), ok)

    expect((await fetchWithRetry(URL_)).status).toBe(code)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up on an attempt that takes longer than the limit and tries again', async () => {
    // The first attempt never answers; it ends when its own time limit aborts it.
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
          }),
      )
      .mockImplementationOnce(async () => ok())
    vi.stubGlobal('fetch', fetchMock)

    const pending = fetchWithRetry(URL_)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)

    expect((await pending).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops at once, without another attempt, when the caller cancels', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    const pending = fetchWithRetry(URL_, controller.signal)
    const outcome = expect(pending).rejects.toBeDefined()
    controller.abort()
    await vi.advanceTimersByTimeAsync(10_000)

    await outcome
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops waiting between attempts when the caller cancels', async () => {
    const fetchMock = stubFetch(() => status(503), ok)
    const controller = new AbortController()

    const pending = fetchWithRetry(URL_, controller.signal)
    const outcome = expect(pending).rejects.toBeDefined()
    await vi.advanceTimersByTimeAsync(500)
    controller.abort()
    await vi.advanceTimersByTimeAsync(10_000)

    await outcome
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
