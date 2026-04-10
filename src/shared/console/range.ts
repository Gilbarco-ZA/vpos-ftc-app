export type DateRange = { start: Date; end: Date }

/**
 * vpos-console supports:
 * - start/end as YYYYMMDD
 * - start/end as ISO strings (may include "T")
 * Defaults to last 7 days when missing.
 */
export function parseConsoleRange(url: string): DateRange {
  const { searchParams } = new URL(url)

  const startRaw = searchParams.get('start')
  const endRaw = searchParams.get('end')

  const now = new Date()
  const defaultEnd = endOfDay(now)
  const defaultStart = startOfDay(addDays(now, -7))

  const start = startRaw ? parseConsoleDate(startRaw, true) : defaultStart
  const end = endRaw ? parseConsoleDate(endRaw, false) : defaultEnd

  return { start, end }
}

function parseConsoleDate(value: string, isStart: boolean): Date {
  if (value.includes('T')) {
    const parsed = new Date(value)
    if (!Number.isFinite(parsed.getTime())) {
      throw new Error(`Invalid date: ${value}`)
    }
    return parsed
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    if (!Number.isFinite(parsed.getTime())) {
      throw new Error(`Invalid date: ${value}`)
    }
    return isStart ? startOfDay(parsed) : endOfDay(parsed)
  }

  if (!/^\d{8}$/.test(value)) {
    throw new Error(
      `Invalid range date (expected YYYYMMDD, YYYY-MM-DD or ISO): ${value}`,
    )
  }

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const parsed = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  return isStart ? startOfDay(parsed) : endOfDay(parsed)
}

function startOfDay(value: Date): Date {
  const normalized = new Date(value)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function endOfDay(value: Date): Date {
  const normalized = new Date(value)
  normalized.setHours(23, 59, 59, 999)
  return normalized
}

function addDays(value: Date, delta: number): Date {
  const normalized = new Date(value)
  normalized.setDate(normalized.getDate() + delta)
  return normalized
}
