import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { EmptyState } from '@/components/shared/StateMessages'
import { PageMeta } from '@/components/shared/PageMeta'
import { CATEGORIES } from '@/features/products/categories'
import { noindexMeta } from '@/lib/seo'

export function NotFoundPage() {
  return (
    <>
      <PageMeta meta={noindexMeta('הדף לא נמצא')} />
      <EmptyState
        title="הדף לא נמצא"
        as="h1"
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Link to={paths.home} className={buttonStyles()}>
              חזרה לדף הבית
            </Link>
            <Link to={paths.products} className={buttonStyles({ variant: 'secondary' })}>
              לכל המוצרים
            </Link>
          </div>
        }
        details={
          <nav aria-label="המשך לקטגוריה">
            <p>אפשר להמשיך מאחת הקטגוריות:</p>
            <ul className="mt-3 flex flex-wrap justify-center gap-2">
              {CATEGORIES.map((category) => (
                <li key={category.id}>
                  <Link
                    to={paths.category(category.id)}
                    className="inline-flex min-h-9 items-center rounded-full border border-line bg-white px-3 text-ink hover:border-brand hover:text-brand"
                  >
                    {category.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        }
      >
        הכתובת שביקשת אינה קיימת, או שהדף הוסר.
      </EmptyState>
    </>
  )
}
