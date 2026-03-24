import { format, parseISO, formatDistanceToNow } from "date-fns"

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-"
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy")
  } catch {
    return dateStr
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-"
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy HH:mm")
  } catch {
    return dateStr
  }
}

export function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return "-"
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

export function formatDuration(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
): string {
  if (!startStr) return "-"
  const start = parseISO(startStr)
  const end = endStr ? parseISO(endStr) : new Date()
  const diffMs = end.getTime() - start.getTime()
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  if (minutes < 60) return `${minutes}m ${remaining}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
