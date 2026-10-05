import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { FormAlert } from '@/components/shared/Notices'
import { Button } from '@/components/ui/Button'
import { CheckboxField, TextAreaField, TextField } from '@/components/ui/fields'
import { checkoutSchema, type CheckoutValues } from './schema'

export type SubmitOutcome = { ok: true } | { ok: false; message: string }

interface CheckoutFormProps {
  defaultValues: Pick<CheckoutValues, 'fullName' | 'email'>
  /** Returns an error message to show at the top of the form when the order could not be placed. */
  onSubmit: (values: CheckoutValues) => Promise<SubmitOutcome> | SubmitOutcome
  /** Shown just above the submit button, e.g. the total being confirmed. */
  totalNote?: ReactNode
}

export function CheckoutForm({ defaultValues, onSubmit, totalNote }: CheckoutFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      ...defaultValues,
      phone: '',
      city: '',
      street: '',
      houseNumber: '',
      apartment: '',
      postalCode: '',
      notes: '',
      acceptDemo: false,
    },
    mode: 'onTouched',
  })

  const submit = handleSubmit(async (values) => {
    const outcome = await onSubmit(values)
    if (!outcome.ok) setError('root', { message: outcome.message })
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {errors.root?.message && <FormAlert>{errors.root.message}</FormAlert>}

      <p className="text-sm text-muted">שדות חובה מסומנים בכוכבית (*).</p>

      <fieldset className="space-y-4 rounded-xl border border-line bg-white p-5">
        <legend className="px-2 text-lg font-bold">פרטי קשר</legend>
        <TextField
          label="שם מלא"
          autoComplete="name"
          required
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="אימייל"
            type="email"
            autoComplete="email"
            required
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="טלפון"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            hint="לדוגמה: 050-1234567"
            error={errors.phone?.message}
            {...register('phone')}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-line bg-white p-5">
        <legend className="px-2 text-lg font-bold">כתובת למשלוח</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="עיר"
            autoComplete="address-level2"
            required
            error={errors.city?.message}
            {...register('city')}
          />
          <TextField
            label="רחוב"
            autoComplete="address-line1"
            required
            error={errors.street?.message}
            {...register('street')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="מספר בית"
            autoComplete="off"
            required
            error={errors.houseNumber?.message}
            {...register('houseNumber')}
          />
          <TextField
            label="דירה (לא חובה)"
            autoComplete="off"
            error={errors.apartment?.message}
            {...register('apartment')}
          />
          <TextField
            label="מיקוד (לא חובה)"
            autoComplete="postal-code"
            inputMode="numeric"
            error={errors.postalCode?.message}
            {...register('postalCode')}
          />
        </div>
        <TextAreaField
          label="הערות למשלוח (לא חובה)"
          maxLength={300}
          error={errors.notes?.message}
          {...register('notes')}
        />
      </fieldset>

      <CheckboxField
        label="אני מבין/ה שזו הזמנת הדגמה: לא מתבצע חיוב, לא נשלח מוצר, והפרטים שהזנתי אינם נשמרים."
        error={errors.acceptDemo?.message}
        {...register('acceptDemo')}
      />

      {/* Under the button's own box on a phone, where the summary is far below the form. */}
      {totalNote}

      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto sm:min-w-56">
        {isSubmitting ? 'שולח…' : 'אישור הזמנה (הדגמה)'}
      </Button>
    </form>
  )
}
