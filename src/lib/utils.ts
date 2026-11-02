export const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const now = () => new Date().toISOString()

export const today = () => new Date().toISOString().slice(0, 10)

export const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : '—'

export const dateTimeLabel = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'

export const decimal = (value?: number, digits = 2) => value === undefined || Number.isNaN(value) ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(value)

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine
