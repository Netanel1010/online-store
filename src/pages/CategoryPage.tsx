import { useParams } from 'react-router'
import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { findCategory } from '@/features/products/categories'
import { ProductListing } from '@/features/products/components/ProductListing'
import { NotFoundPage } from './NotFoundPage'
import { PageMeta } from '@/components/shared/PageMeta'
import { categoryMeta } from '@/lib/seo'

export function CategoryPage() {
  const { categoryId } = useParams()
  const category = findCategory(categoryId)

  if (!category) return <NotFoundPage />

  return (
    <>
      <PageMeta meta={categoryMeta(category)} />
      <Breadcrumbs
        items={[
          { label: 'בית', to: paths.home },
          { label: 'מוצרים', to: paths.products },
          { label: category.label },
        ]}
      />
      <h1 className="mb-6 text-3xl font-bold">{category.label}</h1>
      {/* Keyed by the category, so moving to another one starts a listing of its own. */}
      <ProductListing key={category.id} mode="category" category={category.id} />
    </>
  )
}
