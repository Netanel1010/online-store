import { Link, Navigate, useLocation } from 'react-router'
import { paths } from '@/app/paths'
import { AuthCard } from '@/features/auth/AuthCard'
import { useCurrentUser } from '@/features/auth/authStore'
import { LoginForm } from '@/features/auth/LoginForm'
import { getRedirectTarget } from '@/features/auth/routing'

export function LoginPage() {
  const user = useCurrentUser()
  const location = useLocation()

  // Signed in (including right after a successful login): go where the visitor was heading.
  if (user) return <Navigate to={getRedirectTarget(location.state)} replace />

  return (
    <>
      <title>התחברות | N.M.S</title>
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
        <LoginForm />
      </AuthCard>
    </>
  )
}
