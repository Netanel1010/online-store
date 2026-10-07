const priceFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
})

export function formatPrice(amount: number): string {
  return priceFormatter.format(amount)
}

const dateTimeFormatter = new Intl.DateTimeFormat('he-IL', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** A date and time as the visitor reads them, from an ISO date. */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso))
}
