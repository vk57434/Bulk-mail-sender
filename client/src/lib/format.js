export function formatDate(value, options = { dateStyle: 'medium' }) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, options).format(date)
}

export function formatCount(value) {
  return Number(value || 0).toLocaleString()
}