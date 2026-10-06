import { useEffect, useState } from 'react'

/** How long a page may load before it says why it takes a while. */
export const SLOW_LOAD_AFTER_MS = 4_000

/**
 * Shown under a loading placeholder. It renders nothing at first and, if the page is still loading
 * after a few seconds, explains why: the store's API runs on a free host that falls asleep when it
 * is not used, and waking it up takes up to about a minute. It is mounted only while the page
 * loads, so it starts counting again for the next load.
 */
export function SlowLoadNotice() {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_AFTER_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!slow) return null
  return (
    <p role="status" className="mt-6 text-center text-sm text-muted">
      הטעינה לוקחת יותר מהרגיל. שרת המוצרים של האתר נרדם כשלא משתמשים בו ומתעורר עכשיו, וזה יכול
      לקחת עד דקה. אין צורך לרענן את העמוד.
    </p>
  )
}
