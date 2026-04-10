/* ------------------------------------------------------------------ */
/*  Safe parsing                                                      */
/* ------------------------------------------------------------------ */

/** Parse any value to a Date, returning null on invalid input. */
export const parseDate = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null
  }
  const date = new Date(value as string)
  return Number.isFinite(date.getTime()) ? date : null
}

/** Build a Date from separate date + time strings (e.g. "2024-01-15" + "09:30:00"). */
export const toDateTime = (
  dateStr?: string,
  timeStr?: string,
  fallback?: Date,
): Date => {
  if (dateStr && timeStr) {
    const iso = `${dateStr}T${timeStr}Z`
    const date = new Date(iso)
    if (Number.isFinite(date.getTime())) return date
  }
  return fallback ?? new Date()
}

/* ------------------------------------------------------------------ */
/*  Formatting                                                        */
/* ------------------------------------------------------------------ */

/**
 * Format a value as `YYYY-MM-DD HH:mm` (local time).
 * Falls back to stringified input on invalid dates.
 */
export const formatDateTime = (value: unknown): string => {
  const date = value ? new Date(value as string) : new Date()
  if (Number.isNaN(date.getTime())) return String(value ?? '')
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

/**
 * Client-friendly date display via `toLocaleString()`.
 * Returns em-dash on falsy / invalid input.
 */
export const formatDate = (value?: string | null): string => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
