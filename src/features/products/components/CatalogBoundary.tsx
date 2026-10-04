import type { ReactNode } from 'react'
import { ErrorState } from '@/components/shared/StateMessages'
import type { Product } from '../schema'
import { useProductCatalog } from '../useProductCatalog'

interface CatalogBoundaryProps {
  /** Shown while the catalog loads. Should include a polite status message. */
  loading: ReactNode
  children: (products: readonly Product[]) => ReactNode
}

/** The one place that turns catalog loading/error state into UI, so pages only handle success. */
export function CatalogBoundary({ loading, children }: CatalogBoundaryProps) {
  const catalog = useProductCatalog()

  if (catalog.status === 'loading') return loading
  if (catalog.status === 'error') return <ErrorState onRetry={catalog.retry} />
  return children(catalog.products)
}
