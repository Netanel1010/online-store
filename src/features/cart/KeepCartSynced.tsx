import { useEffect } from 'react'
import { useToast } from '@/features/notifications/toastContext'
import { startCartSync } from './cartSync'

/**
 * Keeps the cart of the signed-in account on the API in step with the cart in this browser (see
 * `startCartSync`), and tells the visitor when something about their cart needs saying. Renders
 * nothing; the layout of the whole site mounts it once.
 */
export function KeepCartSynced() {
  const toast = useToast()
  useEffect(() => startCartSync((message) => toast.show({ message })), [toast])
  return null
}
