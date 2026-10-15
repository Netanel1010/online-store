import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { FormAlert } from '@/components/shared/Notices'
import { Button } from '@/components/ui/Button'
import { CheckboxField, TextAreaField, TextField } from '@/components/ui/fields'
import type { DeliveryDetails } from './delivery'
import { checkoutSchema, type CheckoutValues } from './schema'

/** The line under the address heading that says the address is for the demo; the group is described by it. */
const ADDRESS_NOTE_ID = 'delivery-address-demo-note'

export type SubmitOutcome = { ok: true } | { ok: false; message: string }

interface CheckoutFormProps {
  /**
   * What the form starts with: the name and email of the account, or the details of a draft. The demo
   * tick is not among them, by type: it is always given afresh.
   */
  defaultValues: Pick<CheckoutValues, 'fullName' | 'email'> & Partial<DeliveryDetails>
  /** Returns an error message to show at the top of the form when the order could not be placed. */
  onSubmit: (values: CheckoutValues) => Promise<SubmitOutcome> | SubmitOutcome
  /** Shown just above the submit button, e.g. the total being confirmed. */
  totalNote?: ReactNode
  /**
   * A problem with the order that needs more than a line of text (for example an action to take),
   * shown at the top of the form. A function gets `submit`, which sends the form as it is filled in
   * (checked first, like the button) for a notice that offers an action of its own.
   */
  notice?: ReactNode | ((controls: { submit: () => void }) => ReactNode)
}

export function CheckoutForm({ defaultValues, onSubmit, totalNote, notice }: CheckoutFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      phone: '',
      city: '',
      street: '',
      houseNumber: '',
      apartment: '',
      postalCode: '',
      notes: '',
      ...defaultValues,
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
      {typeof notice === 'function' ? notice({ submit: () => void submit() }) : notice}

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
            dir="ltr"
            autoComplete="email"
            required
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="טלפון"
            type="tel"
            dir="ltr"
            autoComplete="tel"
            inputMode="tel"
            required
            hint="לדוגמה: 050-1234567"
            error={errors.phone?.message}
            {...register('phone')}
          />
        </div>
      </fieldset>

      <fieldset
        aria-describedby={ADDRESS_NOTE_ID}
        className="space-y-4 rounded-xl border border-line bg-white p-5"
      >
        <legend className="px-2 text-lg font-bold">כתובת למשלוח</legend>
        <p id={ADDRESS_NOTE_ID} className="text-sm text-muted">
          כתובת הדגמה: הכתובת נשמרת כחלק מההזמנה לצורכי הדגמה בלבד. לא יתבצע משלוח.
        </p>
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
            dir="ltr"
            autoComplete="postal-code"
            inputMode="numeric"
            error={errors.postalCode?.message}
            {...register('postalCode')}
          />
        </div>
        <TextAreaField
          label="הערות למשלוח (לא חובה)"
          hint="עד 300 תווים"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </fieldset>

      <CheckboxField
        label="אני מבין/ה שזו הזמנת הדגמה בלבד: לא מתבצע תשלום אמיתי, לא יישלח מוצר, ופרטי המשלוח שהזנתי נשמרים בחשבון שלי."
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
