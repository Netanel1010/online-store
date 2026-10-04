import type { ButtonHTMLAttributes } from 'react'
import { buttonStyles, type ButtonStyleOptions } from './buttonStyles'

export function Button({
  variant,
  size,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleOptions) {
  return (
    <button type={type} className={`${buttonStyles({ variant, size })} ${className}`} {...props} />
  )
}
