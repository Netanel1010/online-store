const priceFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
})

export function formatPrice(amount: number): string {
  return priceFormatter.format(amount)
}
