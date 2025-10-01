export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

export function formatPriceShort(price: number): string {
  if (price >= 1000000) {
    return `$${(price / 1000000).toFixed(1)}M`
  }
  if (price >= 1000) {
    return `$${Math.round(price / 1000)}K`
  }
  return formatPrice(price)
}

export function formatDate(dateString: string | null): string {
  if (!dateString) return ''
  
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric'
  }).format(date)
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`
}
