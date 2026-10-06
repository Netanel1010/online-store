import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { FormAlert } from '@/components/shared/Notices'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/fields'
import { useToast } from '@/features/notifications/toastContext'
import { useAuthStore } from './authStore'
import { registerSchema, type RegisterValues } from './schemas'

/** On success the visitor is signed in and the page redirects (see RegisterPage). */
export function RegisterForm() {
  const registerAccount = useAuthStore((state) => state.register)
  const toast = useToast()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
    mode: 'onTouched',
  })

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    const result = await registerAccount({ name, email, password })
    if (result.ok) {
      toast.show({ message: 'החשבון נוצר ואתם מחוברים' })
    } else if (result.reason === 'email-taken') {
      setError('email', { message: 'כתובת האימייל כבר רשומה' }, { shouldFocus: true })
    } else {
      setError('root', {
        message:
          result.reason === 'unavailable'
            ? 'לא הצלחנו להתחבר לשרת. בדקו את החיבור ונסו שוב.'
            : 'לא ניתן היה ליצור את החשבון עם הפרטים שהוזנו. בדקו אותם ונסו שוב.',
      })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {errors.root?.message && <FormAlert>{errors.root.message}</FormAlert>}
      <TextField
        label="שם"
        autoComplete="name"
        required
        error={errors.name?.message}
        {...register('name')}
      />
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
        autoComplete="new-password"
        required
        hint="לפחות 8 תווים, כולל אות וספרה."
        error={errors.password?.message}
        {...register('password')}
      />
      <TextField
        label="אימות סיסמה"
        type="password"
        autoComplete="new-password"
        required
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'יוצר חשבון…' : 'יצירת חשבון'}
      </Button>
    </form>
  )
}
