import { resolveLocalTimezone } from '@/src/shared/time/timezoneCore'

export type LocalDateTimeParts = {
  timezone: string
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
  millisecond: string
  isoDate: string
  displayDate: string
  slashDate: string
  compactDate: string
  time: string
  timeMinutes: number
  localIso: string
  localIsoSeconds: string
  displayDateTime: string
}

const OFFSETLESS_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/

function buildResult(timezone: string, parts: {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
  millisecond: string
}): LocalDateTimeParts {
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`
  const displayDate = `${parts.day}-${parts.month}-${parts.year}`
  const time = `${parts.hour}:${parts.minute}:${parts.second}`
  return {
    timezone,
    ...parts,
    isoDate,
    displayDate,
    slashDate: `${parts.day}/${parts.month}/${parts.year}`,
    compactDate: `${parts.year}${parts.month}${parts.day}`,
    time,
    timeMinutes: Number(parts.hour) * 60 + Number(parts.minute),
    localIso: `${isoDate}T${time}.${parts.millisecond}`,
    localIsoSeconds: `${isoDate}T${time}`,
    displayDateTime: `${displayDate} ${time}`,
  }
}

function offsetlessLocalParts(value: unknown) {
  if (value instanceof Date) return null
  const text = String(value ?? '').trim()
  if (!text) return null

  const match = text.match(OFFSETLESS_LOCAL_RE)
  if (!match) return null

  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4],
    minute: match[5],
    second: match[6] ?? '00',
    millisecond: String(match[7] ?? '0').padEnd(3, '0'),
  }
}

export function localDateTime(
  value: unknown = new Date(),
  timezone?: string | null,
): LocalDateTimeParts {
  const effectiveTimezone = resolveLocalTimezone(timezone)

  const literal = offsetlessLocalParts(value)
  if (literal) return buildResult(effectiveTimezone, literal)

  const date = value instanceof Date ? value : new Date(String(value ?? Date.now()))
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date value')

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: effectiveTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  })
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>

  return buildResult(effectiveTimezone, {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    millisecond: String(values.fractionalSecond || '0').padStart(3, '0'),
  })
}
