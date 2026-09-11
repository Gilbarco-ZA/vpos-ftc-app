import { localDateTime } from '@/src/shared/time/localDateTime'

function dateInput(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00`
  return value
}

function timeInput(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) {
    const [hour, minute, second = '00'] = text.split(':')
    return `1970-01-01T${hour.padStart(2, '0')}:${minute}:${second}`
  }
  return value
}

export const formatReceiptDate = (value?: unknown, timezone?: string | null) => {
  const input = dateInput(value)
  if (input == null) return ''
  try {
    return localDateTime(input, timezone).displayDate
  } catch {
    return String(value ?? '')
  }
}

export const formatReceiptTime = (value?: unknown, timezone?: string | null) => {
  const input = timeInput(value)
  if (input == null) return ''
  try {
    return localDateTime(input, timezone).time
  } catch {
    return String(value ?? '')
  }
}

export const formatReceiptDateTimeDisplay = (args: {
  receiptDate?: unknown
  receiptTime?: unknown
  receiptDateTime?: unknown
  timezone?: string | null
}) => {
  const date = formatReceiptDate(
    args.receiptDate || args.receiptDateTime,
    args.timezone,
  )
  const time = formatReceiptTime(
    args.receiptTime || args.receiptDateTime,
    args.timezone,
  )
  return { date, time }
}
