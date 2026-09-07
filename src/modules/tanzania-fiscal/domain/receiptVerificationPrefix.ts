export type TanzaniaReceiptVerificationPrefixMode = 'registered' | 'manual'

export const DEFAULT_TANZANIA_RECEIPT_VERIFICATION_PREFIX_MODE: TanzaniaReceiptVerificationPrefixMode =
  'registered'

export const TANZANIA_RECEIPT_VERIFICATION_URLS = {
  development: 'https://virtual.tra.go.tz/efdmsRctVerify/',
  production: 'https://verify.tra.go.tz/',
} as const

export type TanzaniaReceiptVerificationUrlMode =
  | keyof typeof TANZANIA_RECEIPT_VERIFICATION_URLS
  | 'manual'

export const DEFAULT_TANZANIA_RECEIPT_VERIFICATION_URL_MODE: TanzaniaReceiptVerificationUrlMode =
  'development'

const PREFIX_PATTERN = /^[A-Z0-9]{6}$/

export function normalizeTanzaniaRegisteredReceiptCode(
  value: unknown,
): string | null {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  return normalized || null
}

export function normalizeTanzaniaReceiptVerificationPrefixOverride(
  value: unknown,
): string | null {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  if (!normalized) return null
  if (!PREFIX_PATTERN.test(normalized)) {
    throw new Error(
      'Receipt verification prefix must contain exactly 6 letters or numbers.',
    )
  }
  return normalized
}

export function resolveTanzaniaReceiptVerificationPrefix(args: {
  mode?: TanzaniaReceiptVerificationPrefixMode | null
  registeredReceiptCode?: unknown
  override?: unknown
}): string {
  const mode = args.mode ?? DEFAULT_TANZANIA_RECEIPT_VERIFICATION_PREFIX_MODE
  if (mode === 'registered') {
    const receiptCode = normalizeTanzaniaRegisteredReceiptCode(
      args.registeredReceiptCode,
    )
    if (!receiptCode) {
      throw new Error(
        'Registered Tanzania receiptCode is unavailable. Refresh or re-register the device in vpos-proxy, or select Manual override.',
      )
    }
    return receiptCode
  }
  if (mode !== 'manual') {
    throw new Error(`Unsupported receipt verification prefix mode: ${mode}`)
  }

  const override = normalizeTanzaniaReceiptVerificationPrefixOverride(
    args.override,
  )
  if (!override) {
    throw new Error(
      'A manual receipt verification prefix is required when Manual override is selected.',
    )
  }
  return override
}

export function normalizeTanzaniaReceiptVerificationUrlOverride(
  value: unknown,
): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    throw new Error('Manual TRA receipt verification URL must be a valid URL.')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Manual TRA receipt verification URL must use HTTP or HTTPS.')
  }
  const normalized = parsed.toString()
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

export function resolveTanzaniaReceiptVerificationUrlBase(args: {
  mode?: TanzaniaReceiptVerificationUrlMode | null
  override?: unknown
}): string {
  const mode = args.mode ?? DEFAULT_TANZANIA_RECEIPT_VERIFICATION_URL_MODE
  if (mode === 'development' || mode === 'production') {
    return TANZANIA_RECEIPT_VERIFICATION_URLS[mode]
  }
  if (mode !== 'manual') {
    throw new Error(`Unsupported receipt verification URL mode: ${mode}`)
  }
  const override = normalizeTanzaniaReceiptVerificationUrlOverride(args.override)
  if (!override) {
    throw new Error(
      'A manual TRA receipt verification URL is required when Manual URL is selected.',
    )
  }
  return override
}

const receiptTimeToken = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const timestampMatch = text.match(/T(\d{2}):(\d{2}):(\d{2})/)
  if (timestampMatch) {
    return `${timestampMatch[1]}${timestampMatch[2]}${timestampMatch[3]}`
  }
  const timeMatch = text.match(/^(\d{2}):(\d{2}):(\d{2})/)
  return timeMatch ? `${timeMatch[1]}${timeMatch[2]}${timeMatch[3]}` : ''
}

export function buildTanzaniaReceiptVerificationUrl(args: {
  receiptVerificationNumber: unknown
  urlMode?: TanzaniaReceiptVerificationUrlMode | null
  urlOverride?: unknown
  invoiceDate?: unknown
  receiptTime?: unknown
}): string | null {
  const receiptVerificationNumber = String(
    args.receiptVerificationNumber ?? '',
  ).trim()
  if (!receiptVerificationNumber) return null

  const baseUrl = resolveTanzaniaReceiptVerificationUrlBase({
    mode: args.urlMode,
    override: args.urlOverride,
  })
  const time =
    receiptTimeToken(args.invoiceDate) || receiptTimeToken(args.receiptTime)
  const verificationCode = time
    ? `${receiptVerificationNumber}_${time}`
    : receiptVerificationNumber

  return `${baseUrl}${verificationCode}`
}
