const MONTH_NUMBERS: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
}

const pad2 = (value: number | string) => String(value).padStart(2, '0')

export const formatReceiptDate = (value?: unknown) => {
  const text = String(value ?? '').trim()
  if (!text) return ''

  const isoLike = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/)
  if (isoLike) return `${isoLike[3]}-${isoLike[2]}-${isoLike[1]}`

  const displayLike = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s|$)/)
  if (displayLike) {
    return `${pad2(displayLike[1])}-${pad2(displayLike[2])}-${displayLike[3]}`
  }

  // PostgreSQL TIMESTAMPTZ values can reach the UI as the default JavaScript
  // Date string, e.g. "Thu Sep 10 2026 17:13:01 GMT+0200 (...)". Extract the
  // wall-clock date directly so rendering does not depend on the browser/server
  // timezone.
  const jsDate = text.match(
    /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})(?:\s|$)/,
  )
  if (jsDate) {
    const month = MONTH_NUMBERS[jsDate[1]]
    if (month) return `${pad2(jsDate[2])}-${month}-${jsDate[3]}`
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return text
  return `${pad2(parsed.getUTCDate())}-${pad2(parsed.getUTCMonth() + 1)}-${parsed.getUTCFullYear()}`
}

export const formatReceiptTime = (value?: unknown) => {
  const text = String(value ?? '').trim()
  if (!text) return ''

  const literalTime = text.match(/(?:^|[T\s])(\d{2}:\d{2}:\d{2})(?:[.\sZ+\-]|$)/)
  if (literalTime) return literalTime[1]

  const timeOnly = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (timeOnly) {
    return `${pad2(timeOnly[1])}:${timeOnly[2]}:${timeOnly[3] ?? '00'}`
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return text
  return `${pad2(parsed.getUTCHours())}:${pad2(parsed.getUTCMinutes())}:${pad2(parsed.getUTCSeconds())}`
}

export const formatReceiptDateTimeDisplay = (args: {
  receiptDate?: unknown
  receiptTime?: unknown
  receiptDateTime?: unknown
}) => {
  const date = formatReceiptDate(args.receiptDate || args.receiptDateTime)
  const time = formatReceiptTime(args.receiptTime || args.receiptDateTime)
  return { date, time }
}
