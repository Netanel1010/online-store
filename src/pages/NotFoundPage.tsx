import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { EmptyState } from '@/components/shared/StateMessages'
import { PageMeta } from '@/components/shared/PageMeta'
import { noindexMeta } from '@/lib/seo'

export function NotFoundPage() {
  return (
    <>
      <PageMeta meta={noindexMeta('הדף לא נמצא')} />
      <EmptyState
        title="הדף לא נמצא"
        as="h1"
        action={
          <Link to={paths.home} className={buttonStyles()}>
            חזרה לדף הבית
          </Link>
        }
      >
        הכתובת שביקשת אינה קיימת.
      </EmptyState>
    </>
  )
}
