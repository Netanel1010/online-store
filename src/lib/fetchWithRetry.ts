/**
 * How a read of the API is attempted. The API runs on a free host that falls asleep when it is not
 * used: the first request after a pause can fail while it wakes up (a gateway error, or no answer
 * at all) or take a long time. Every read is a GET, so repeating one is safe.
 *
 * `delaysMs` are the pauses between attempts, so there is one more attempt than there are delays.
 * It is an object that tests change (src/test/setup.ts turns the retries off so a test of a failed
 * request does not wait); nothing else in the app does.
 */
export const fetchPolicy = {
  /** How long one attempt may take before it is given up and, if there are attempts left, repeated. */
  attemptTimeoutMs: 30_000,
  delaysMs: [1_500, 4_000] as number[],
}

/** Answers that mean "the server is not ready" rather than "the request is wrong". */
const RETRYABLE_STATUS = new Set([502, 503, 504])

/** Rejects when the caller gives up; resolves after `ms` otherwise. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * One attempt's signal: it aborts when the caller cancels and when the attempt's time is up. A
 * plain timer and controller rather than `AbortSignal.timeout` and `AbortSignal.any`, which older
 * browsers lack. Call `clear` once the attempt has answered.
 */
function attemptSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException('The request took too long', 'TimeoutError')),
    timeoutMs,
  )
  const onAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * `fetch` for a GET that may be repeated: an attempt that fails to connect, runs out of time or is
 * answered with 502, 503 or 504 is tried again after a pause. Any other answer, including an
 * error such as 404 or 500, is returned as it is, and a request the caller cancels stops at once.
 * After the last attempt the last answer is returned, or the last failure is thrown.
 */
export async function fetchWithRetry(url: string, signal?: AbortSignal): Promise<Response> {
  const { attemptTimeoutMs, delaysMs } = fetchPolicy
  for (let attempt = 0; ; attempt += 1) {
    const last = attempt >= delaysMs.length
    const current = attemptSignal(signal, attemptTimeoutMs)
    try {
      const response = await fetch(url, { signal: current.signal })
      if (last || !RETRYABLE_STATUS.has(response.status)) return response
    } catch (error) {
      if (signal?.aborted || last) throw error
    } finally {
      current.clear()
    }
    await pause(delaysMs[attempt]!, signal)
  }
}
