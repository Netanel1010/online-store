import { Link, Navigate, useLocation } from 'react-router'
import { paths } from '@/app/paths'
import { AuthCard } from '@/features/auth/AuthCard'
import { useCurrentUser } from '@/features/auth/authStore'
import { LoginForm } from '@/features/auth/LoginForm'
import { getRedirectTarget, sessionEndedBefore } from '@/features/auth/routing'
import { StatusNotice } from '@/components/shared/Notices'
import { PageMeta } from '@/components/shared/PageMeta'
import { noindexMeta } from '@/lib/seo'

export function LoginPage() {
  const user = useCurrentUser()
  const location = useLocation()

  // Signed in (including right after a successful login): go where the visitor was heading.
  if (user) return <Navigate to={getRedirectTarget(location.state)} replace />

  return (
    <>
      <PageMeta meta={noindexMeta('התחברות')} />
      <AuthCard
        title="התחברות"
        footer={
          <>
            אין לכם חשבון?{' '}
            <Link
              to={paths.register}
              state={location.state}
              className="font-semibold text-brand underline-offset-4 hover:underline"
            >
              הרשמה
            </Link>
          </>
        }
      >
        {sessionEndedBefore(location.state) && (
          <div className="mb-4">
            <StatusNotice>ההתחברות הסתיימה. התחברו שוב כדי להמשיך להזמנה.</StatusNotice>
          </div>
        )}
        <LoginForm />
      </AuthCard>
    </>
  )
}
