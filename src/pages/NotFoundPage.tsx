import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { EmptyState } from '@/components/shared/StateMessages'

export function NotFoundPage() {
  return (
    <>
      <title>הדף לא נמצא | N.M.S</title>
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
