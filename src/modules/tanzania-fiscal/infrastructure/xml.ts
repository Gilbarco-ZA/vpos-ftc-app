import { localDateTime } from '@/src/shared/time/localDateTime'
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

export function dateParts(value: unknown, timezone?: string) {
  const parts = localDateTime(value, timezone)
  return {
    isoDate: parts.isoDate,
    slashDate: parts.slashDate,
    compactDate: parts.compactDate,
    time: parts.time,
  }
}

export function isoDateTimeInTimezone(value: unknown, timezone?: string) {
  // vpos-proxy receives the effective site/device local wall-clock time.
  // Do not append Z or an explicit offset; the proxy forwards this field as supplied.
  return localDateTime(value, timezone).localIso
}
