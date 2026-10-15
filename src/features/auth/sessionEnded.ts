/**
 * "The session of the visitor ended just now": set by the page that learned it from the API (the
 * checkout, when an order or the question about an earlier attempt is answered with 401), read by the
 * guard of the protected pages when it sends the visitor to the login page, so that the login page can
 * say why they are there. It is a fact about the last few seconds, not a setting: it expires on its
 * own, and the guard clears it once it has used it, so that a visitor who is sent to the login page
 * for any other reason (nobody was signed in) is never told that a session ended.
 *
 * It does not tell an ended session from a sign-out and is not asked to: only the pages that learn
 * it from the API set it, and signing out never does.
 */
const FRESH_FOR_MS = 10_000

let endedAt: number | null = null

export function markSessionEnded(now: number = Date.now()): void {
  endedAt = now
}

export function sessionJustEnded(now: number = Date.now()): boolean {
  return endedAt !== null && now - endedAt >= 0 && now - endedAt < FRESH_FOR_MS
}

export function clearSessionEnded(): void {
  endedAt = null
}
