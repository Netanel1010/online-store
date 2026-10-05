import { Link, Navigate, useLocation } from 'react-router'
import { paths } from '@/app/paths'
import { AuthCard } from '@/features/auth/AuthCard'
import { useCurrentUser } from '@/features/auth/authStore'
import { RegisterForm } from '@/features/auth/RegisterForm'
import { getRedirectTarget } from '@/features/auth/routing'
import { PageMeta } from '@/components/shared/PageMeta'
import { noindexMeta } from '@/lib/seo'

export function RegisterPage() {
  const user = useCurrentUser()
  const location = useLocation()

  if (user) return <Navigate to={getRedirectTarget(location.state)} replace />

  return (
    <>
      <PageMeta meta={noindexMeta('הרשמה')} />
      <AuthCard
        title="הרשמה"
        footer={
          <>
            כבר יש לכם חשבון?{' '}
            <Link
              to={paths.login}
              state={location.state}
              className="font-semibold text-brand underline-offset-4 hover:underline"
            >
              התחברות
            </Link>
          </>
        }
      >
        <RegisterForm />
      </AuthCard>
    </>
  )
}
