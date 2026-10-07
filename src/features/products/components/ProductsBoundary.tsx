import type { ReactNode } from 'react'
import { SlowLoadNotice } from '@/components/shared/SlowLoadNotice'
import { ErrorState } from '@/components/shared/StateMessages'
import type { Product } from '../schema'
import { useProductsByIds } from '../useProductsByIds'

interface ProductsBoundaryProps {
  /** The products to load. Nothing is asked for when there are none. */
  ids: readonly string[]
  /** Shown while they load. Should include a polite status message. */
  loading: ReactNode
  children: (products: readonly Product[]) => ReactNode
}

/** The one place that turns the loading and error states of a lookup into UI, so pages only handle success. */
export function ProductsBoundary({ ids, loading, children }: ProductsBoundaryProps) {
  const lookup = useProductsByIds(ids)

  if (lookup.status === 'loading') {
    return (
      <>
        {loading}
        <SlowLoadNotice />
      </>
    )
  }
  if (lookup.status === 'error') return <ErrorState onRetry={lookup.retry} />
  return children(lookup.products)
}
