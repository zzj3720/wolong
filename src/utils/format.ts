export function formatClipboardLabel(entry: WindowClipboardEntry): string {
  if (entry.text) {
    const trimmed = entry.text.trim()
    return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed
  }

  if (entry.image) {
    return 'Image'
  }

  return entry.format
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - timestamp)
  const minutes = Math.floor(delta / 60000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`

  const years = Math.floor(days / 365)
  return `${years}y ago`
}
