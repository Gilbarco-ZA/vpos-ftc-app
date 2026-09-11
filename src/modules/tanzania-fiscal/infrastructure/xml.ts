import { signXmlSha1Base64 } from './certificates'
import { resolveLocalTimezone } from './timezone'

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

type FiscalDateTimeParts = {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
  fractionalSecond: string
}

function literalLocalParts(value: unknown): FiscalDateTimeParts | null {
  if (value instanceof Date) return null
  const text = String(value ?? '').trim()
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/,
  )
  if (!match) return null
  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4],
    minute: match[5],
    second: match[6],
    fractionalSecond: String(match[7] ?? '0').padEnd(3, '0'),
  }
}

function fiscalDateTimeParts(
  value: unknown,
  timezone?: string,
): FiscalDateTimeParts {
  const literal = literalLocalParts(value)
  if (literal) return literal

  const date =
    value instanceof Date ? value : new Date(String(value || Date.now()))
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Invalid date value')
  }

  const effectiveTimezone = resolveLocalTimezone(timezone)
  const fmt = new Intl.DateTimeFormat('en-CA', {
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
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((part) => [part.type, part.value]),
  ) as Record<string, string>

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    fractionalSecond: String(parts.fractionalSecond || '0').padStart(3, '0'),
  }
}

export function dateParts(value: unknown, timezone?: string) {
  const parts = fiscalDateTimeParts(value, timezone)

  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    slashDate: `${parts.day}/${parts.month}/${parts.year}`,
    compactDate: `${parts.year}${parts.month}${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  }
}

export function isoDateTimeInTimezone(value: unknown, timezone?: string) {
  const parts = fiscalDateTimeParts(value, timezone)

  // vpos-proxy receives the effective site/device local wall-clock time.
  // Do not append Z or an explicit offset; the proxy forwards this field as
  // supplied to the country fiscal API mapper.
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}`
}
