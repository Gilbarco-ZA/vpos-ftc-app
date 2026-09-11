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
const JS_DATE_RE = /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+GMT[+-]\d{4}/
const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

function runtimeTimezone() {
  const timezone = String(Intl.DateTimeFormat().resolvedOptions().timeZone || '').trim()
  if (!timezone) throw new Error('Unable to resolve runtime timezone')
  return timezone
}

function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0))
    return true
  } catch {
    return false
  }
}

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

function literalParts(value: unknown) {
  if (value instanceof Date) return null
  const text = String(value ?? '').trim()
  if (!text) return null

  const iso = text.match(OFFSETLESS_LOCAL_RE)
  if (iso) {
    return {
      year: iso[1], month: iso[2], day: iso[3], hour: iso[4], minute: iso[5],
      second: iso[6] ?? '00', millisecond: String(iso[7] ?? '0').padEnd(3, '0'),
    }
  }

  const js = text.match(JS_DATE_RE)
  const month = js ? MONTHS[js[1]] : undefined
  if (js && month) {
    return {
      year: js[3], month, day: String(js[2]).padStart(2, '0'), hour: js[4],
      minute: js[5], second: js[6], millisecond: '000',
    }
  }

  return null
}

/**
 * Single local date/time projection used by VPOS.
 * Station-sensitive callers pass the effective timezone resolved on the server.
 */
export function localDateTime(
  value: unknown = new Date(),
  timezone?: string | null,
): LocalDateTimeParts {
  const effectiveTimezone = String(timezone ?? '').trim() || runtimeTimezone()
  if (!validTimezone(effectiveTimezone)) throw new Error(`Invalid timezone: ${effectiveTimezone}`)

  const literal = literalParts(value)
  if (literal) return buildResult(effectiveTimezone, literal)

  const date = value instanceof Date ? value : new Date(String(value ?? Date.now()))
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date value')

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: effectiveTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  })
  const values = Object.fromEntries(
    formatter.formatToParts(date)
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
