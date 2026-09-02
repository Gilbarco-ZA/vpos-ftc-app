export type TanzaniaProxyReceiptMetadata = {
  invoiceNumber: string | null
  receiptVerificationNumber: string | null
  zNumber: string | null
  dailyCounter: string | number | null
  globalCounter: string | number | null
  invoiceDate: string | null
}

const parseObject = (value: unknown): Record<string, any> | null => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>
  }
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null
  } catch {
    return null
  }
}

const text = (value: unknown): string | null => {
  const normalized = String(value ?? '').trim()
  return normalized.length ? normalized : null
}

export function extractTanzaniaProxyReceiptMetadata(
  source: unknown,
): TanzaniaProxyReceiptMetadata | null {
  const root = parseObject(source)
  if (!root) return null

  const candidates = [
    root.tanzania,
    root.request?.tanzania,
    root.submission?.request?.tanzania,
    root.payload?.tanzania,
    root.data?.tanzania,
  ]
  const metadata = candidates.find(
    (candidate) =>
      candidate && typeof candidate === 'object' && !Array.isArray(candidate),
  )
  if (!metadata) return null

  const result: TanzaniaProxyReceiptMetadata = {
    invoiceNumber: text(metadata.invoiceNumber),
    receiptVerificationNumber: text(metadata.rctVerificationNum),
    zNumber: text(metadata.zNumber),
    dailyCounter: metadata.dailyCounter ?? null,
    globalCounter: metadata.globalCounter ?? null,
    invoiceDate: text(metadata.invoiceDate),
  }

  return Object.values(result).some(
    (value) => value !== null && value !== undefined && value !== '',
  )
    ? result
    : null
}
