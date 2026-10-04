type Variant = 'primary' | 'secondary'
type Size = 'md' | 'sm'

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong',
  secondary: 'border border-line bg-white text-ink hover:bg-surface',
}

const sizes: Record<Size, string> = {
  md: 'min-h-11 px-5 text-base',
  sm: 'min-h-9 px-3 text-sm',
}

export interface ButtonStyleOptions {
  variant?: Variant
  size?: Size
}

/** Class names for anything that should look like a button (a <button> or a router <Link>). */
export function buttonStyles({ variant = 'primary', size = 'md' }: ButtonStyleOptions = {}) {
  return `${base} ${variants[variant]} ${sizes[size]}`
}
