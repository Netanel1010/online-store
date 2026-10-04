import type { SVGProps } from 'react'

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="size-5"
      {...props}
    />
  )
}

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  )
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  )
}

/** Points toward the inline-end (left in RTL). Flips automatically with the document direction. */
export function ChevronEndIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className="size-5 rtl:-scale-x-100" {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  )
}

/** Points toward the inline-start (right in RTL). Flips automatically with the document direction. */
export function ChevronStartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className="size-5 rtl:-scale-x-100" {...props}>
      <path d="M15 6l-6 6 6 6" />
    </Icon>
  )
}

export function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className="size-4" {...props}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Icon>
  )
}

export function CartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.76L20 8H6.2" />
      <circle cx="9.5" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </Icon>
  )
}

export function HeartIcon({
  filled = false,
  ...props
}: SVGProps<SVGSVGElement> & { filled?: boolean }) {
  return (
    <Icon fill={filled ? 'currentColor' : 'none'} {...props}>
      <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" />
    </Icon>
  )
}
