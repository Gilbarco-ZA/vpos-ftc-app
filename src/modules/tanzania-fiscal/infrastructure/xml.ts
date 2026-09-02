import { signXmlSha1Base64 } from './certificates'

export function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function xmlTag(name: string, value: unknown): string {
  const text = value == null ? '' : String(value)
  return text.length ? `<${name}>${xmlEscape(text)}</${name}>` : `<${name} />`
}

export function normalizeXmlForSigning(xml: string): string {
  return String(xml || '')
    .replace(/<\?xml[^>]*\?>/, '')
    .replace(/[\n\r]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/>\s+/g, '>')
    .replace(/\s+</g, '<')
    .trim()
}

export function signSha1Base64(input: string, privateKeyPem: string): string {
  return signXmlSha1Base64({ payload: input, privateKeyPem })
}

export function parseXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const match = re.exec(String(xml || ''))
  if (!match) return null
  return match[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export function numberText(value: unknown, digits = 2, fallback = 0): string {
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : fallback.toFixed(digits)
}

export function dateParts(value: unknown, timezone = 'Africa/Dar_es_Salaam') {
  const date =
    value instanceof Date ? value : new Date(String(value || Date.now()))
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((part) => [part.type, part.value]),
  ) as Record<string, string>

  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    slashDate: `${parts.day}/${parts.month}/${parts.year}`,
    compactDate: `${parts.year}${parts.month}${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  }
}

export function isoDateTimeInTimezone(
  value: unknown,
  timezone = 'Africa/Dar_es_Salaam',
) {
  const date =
    value instanceof Date ? value : new Date(String(value || Date.now()))
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Invalid date value')
  }

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((part) => [part.type, part.value]),
  ) as Record<string, string>

  const milliseconds = Number(parts.fractionalSecond || '0')
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    milliseconds,
  )
  const offsetMinutes = Math.round((zonedAsUtc - date.getTime()) / 60_000)
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absoluteOffset = Math.abs(offsetMinutes)
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0')
  const offsetMins = String(absoluteOffset % 60).padStart(2, '0')

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${String(milliseconds).padStart(3, '0')}${sign}${offsetHours}:${offsetMins}`
}
