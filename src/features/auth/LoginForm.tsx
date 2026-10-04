import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { FormAlert } from '@/components/shared/Notices'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/fields'
import { useToast } from '@/features/notifications/toastContext'
import { useAuthStore } from './authStore'
import { loginSchema, type LoginValues } from './schemas'

/**
 * On success the signed-in state changes and the page redirects (see LoginPage), so this form
 * only reports the outcome.
 */
export function LoginForm() {
  const login = useAuthStore((state) => state.login)
  const toast = useToast()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  })

  const onSubmit = handleSubmit(async (values) => {
    const result = await login(values)
    if (result.ok) {
      toast.show({ message: 'התחברתם בהצלחה' })
    } else {
      // Deliberately vague: it does not say whether the email or the password was wrong.
      setError('root', { message: 'כתובת האימייל או הסיסמה שגויים' })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {errors.root?.message && <FormAlert>{errors.root.message}</FormAlert>}
      <TextField
        label="אימייל"
        type="email"
        autoComplete="email"
        required
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="סיסמה"
        type="password"
        autoComplete="current-password"
        required
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'מתחבר…' : 'התחברות'}
      </Button>
    </form>
  )
}
