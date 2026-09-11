import { localDateTime } from '@/src/shared/time/localDateTime'

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

/** Format a value as `YYYY-MM-DD HH:mm` through the shared local-time projection. */
export const formatDateTime = (
  value: unknown,
  timezone?: string | null,
): string => {
  try {
    const local = localDateTime(value || new Date(), timezone)
    return `${local.isoDate} ${local.hour}:${local.minute}`
  } catch {
    return String(value ?? '')
  }
}

/** Client-friendly station-local date/time display. */
export const formatDate = (
  value?: string | null,
  timezone?: string | null,
): string => {
  if (!value) return '—'
  try {
    return localDateTime(value, timezone).displayDateTime
  } catch {
    return value
  }
}
