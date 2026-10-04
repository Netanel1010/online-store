import { useState } from 'react'

interface QuantityStepperProps {
  value: number
  onChange: (quantity: number) => void
  /** Used in the accessible names, so each stepper on a page is distinguishable. */
  label: string
  max: number
}

const stepButton =
  'inline-flex size-10 items-center justify-center text-lg font-semibold hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40'

/**
 * Quantity control: minus/plus buttons and a numeric field. While typing, the field shows the
 * raw text and only commits whole numbers from 1 to `max`; leaving the field (or pressing
 * Enter) snaps it back to the real quantity.
 */
export function QuantityStepper({ value, onChange, label, max }: QuantityStepperProps) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <div
      role="group"
      aria-label={`כמות: ${label}`}
      className="inline-flex rounded-lg border border-line"
    >
      <button
        type="button"
        aria-label={`הפחתת כמות: ${label}`}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        className={`${stepButton} rounded-s-lg`}
      >
        <span aria-hidden="true">−</span>
      </button>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`כמות ${label}`}
        value={draft ?? String(value)}
        onChange={(event) => {
          const text = event.target.value
          if (!/^\d*$/.test(text)) return
          const parsed = Number(text)
          if (text !== '' && parsed >= 1) {
            const quantity = Math.min(parsed, max)
            onChange(quantity)
            setDraft(parsed > max ? String(max) : text)
          } else {
            setDraft(text)
          }
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="w-12 border-x border-line text-center text-base tabular-nums"
      />
      <button
        type="button"
        aria-label={`הגדלת כמות: ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={`${stepButton} rounded-e-lg`}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  )
}
