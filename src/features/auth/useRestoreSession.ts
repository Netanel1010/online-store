import { useEffect } from 'react'
import { useAuthStore } from './authStore'

/**
 * Asks the API whether the session token kept in this browser is still good, once the app is on
 * screen. Called by the layout of the whole site and by the guard of the protected pages, so a
 * page opened directly gets its answer whichever of them is mounted first; asking twice at the
 * same moment sends one request.
 */
export function useRestoreSession() {
  const restore = useAuthStore((state) => state.restore)
  useEffect(() => {
    void restore()
  }, [restore])
}
