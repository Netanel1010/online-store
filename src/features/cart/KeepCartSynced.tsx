import { useEffect } from 'react'
import { useToast } from '@/features/notifications/toastContext'
import { startCartSync } from './cartSync'
import { startCartTabSync } from './cartTabSync'

/**
 * Keeps the cart of the signed-in account on the API in step with the cart in this browser (see
 * `startCartSync`), keeps the cart of this tab in step with the other tabs (see `startCartTabSync`),
 * and tells the visitor when something about their cart needs saying. Renders nothing; the layout of
 * the whole site mounts it once.
 */
export function KeepCartSynced() {
  const toast = useToast()
  useEffect(() => startCartSync((message) => toast.show({ message })), [toast])
  // The cart of this tab follows the one the browser keeps when another tab changes it.
  useEffect(() => startCartTabSync(), [])
  return null
}
