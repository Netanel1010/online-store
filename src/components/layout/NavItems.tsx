import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { paths } from '@/app/paths'
import { findProduct } from '@/features/products/selectors'
import { useLoadedCatalog } from '@/features/products/useProductCatalog'
import {
  ariaCurrent,
  categoryOfPath,
  mainLinkState,
  productIdOfPath,
  type LinkState,
  type MainLink,
} from './navigation'

interface ItemProps {
  className: (active: boolean) => string
  children: ReactNode
}

/** A link of the main navigation, marked for assistive technology when it is the current page. */
export function MainNavLink({ link, className, children }: ItemProps & { link: MainLink }) {
  const { pathname } = useLocation()
  const state = mainLinkState(link, pathname)

  return (
    <Link to={link.to} aria-current={ariaCurrent(state)} className={className(state !== null)}>
      {children}
    </Link>
  )
}

/**
 * The state of a category link: the category page itself is `page`, and the page of a product of
 * that category is `section`, so the bar still tells the visitor where they are.
 */
function useCategoryLinkState(categoryId: string): LinkState {
  const { pathname } = useLocation()
  const products = useLoadedCatalog()

  const onCategoryPage = categoryOfPath(pathname)
  if (onCategoryPage) return onCategoryPage.id === categoryId ? 'page' : null

  const productId = productIdOfPath(pathname)
  if (productId === null || products === null) return null
  return findProduct(products, productId)?.category === categoryId ? 'section' : null
}

export function CategoryNavLink({
  categoryId,
  className,
  children,
}: ItemProps & { categoryId: string }) {
  const state = useCategoryLinkState(categoryId)

  return (
    <Link
      to={paths.category(categoryId)}
      aria-current={ariaCurrent(state)}
      className={className(state !== null)}
    >
      {children}
    </Link>
  )
}
