import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react'

/**
 * Form fields for React Hook Form (`{...register('name')}`). Each one wires its label, hint and
 * error message to the control (`htmlFor`, `aria-describedby`, `aria-invalid`), so screen readers
 * hear the problem when focus lands on the field. Forms using them set `noValidate` and let Zod
 * decide what is valid, so there is one set of messages, in Hebrew.
 */

const controlBase =
  'w-full rounded-lg border bg-white px-3 text-base placeholder:text-muted/70 disabled:opacity-60'

function controlClass(hasError: boolean) {
  return `${controlBase} ${hasError ? 'border-sale' : 'border-line'}`
}

interface FieldShellProps {
  id: string
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: (describedBy: string | undefined) => ReactNode
}

function FieldShell({ id, label, required, hint, error, children }: FieldShellProps) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
        {required && (
          <span aria-hidden="true" className="text-sale">
            {' '}
            *
          </span>
        )}
      </label>
      {children(describedBy || undefined)}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm font-medium text-sale">
          {error}
        </p>
      )}
    </div>
  )
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string
  hint?: string
  error?: string
  ref?: Ref<HTMLInputElement>
}

export function TextField({ label, hint, error, id, required, ref, ...input }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <FieldShell id={inputId} label={label} required={required} hint={hint} error={error}>
      {(describedBy) => (
        <input
          {...input}
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${controlClass(Boolean(error))} min-h-11`}
        />
      )}
    </FieldShell>
  )
}

interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className'
> {
  label: string
  hint?: string
  error?: string
  ref?: Ref<HTMLTextAreaElement>
}

export function TextAreaField({
  label,
  hint,
  error,
  id,
  required,
  ref,
  ...input
}: TextAreaFieldProps) {
  const autoId = useId()
  const textareaId = id ?? autoId

  return (
    <FieldShell id={textareaId} label={label} required={required} hint={hint} error={error}>
      {(describedBy) => (
        <textarea
          {...input}
          ref={ref}
          id={textareaId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${controlClass(Boolean(error))} min-h-24 py-2`}
        />
      )}
    </FieldShell>
  )
}

interface CheckboxFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'type'
> {
  label: ReactNode
  error?: string
  ref?: Ref<HTMLInputElement>
}

export function CheckboxField({ label, error, id, ref, ...input }: CheckboxFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`

  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          {...input}
          ref={ref}
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-1 size-5 shrink-0 accent-brand"
        />
        <label htmlFor={inputId} className="text-sm">
          {label}
        </label>
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm font-medium text-sale">
          {error}
        </p>
      )}
    </div>
  )
}
