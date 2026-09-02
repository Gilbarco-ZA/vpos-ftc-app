export const TANZANIA_RECEIPT_VERIFICATION_PREFIXES = {
  development: 'F1D845',
  production: '4BC37A',
} as const

export type TanzaniaReceiptVerificationPrefixMode =
  | keyof typeof TANZANIA_RECEIPT_VERIFICATION_PREFIXES
  | 'manual'

export const DEFAULT_TANZANIA_RECEIPT_VERIFICATION_PREFIX_MODE: TanzaniaReceiptVerificationPrefixMode =
  'development'

export const TANZANIA_RECEIPT_VERIFICATION_URLS = {
  development: 'https://virtual.tra.go.tz/efdmsRctVerify/',
  production: 'https://verify.tra.go.tz/',
} as const

const PREFIX_PATTERN = /^[A-Z0-9]{6}$/

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
  override?: unknown
}): string {
  const mode = args.mode ?? DEFAULT_TANZANIA_RECEIPT_VERIFICATION_PREFIX_MODE
  if (mode === 'development' || mode === 'production') {
    return TANZANIA_RECEIPT_VERIFICATION_PREFIXES[mode]
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
  mode?: TanzaniaReceiptVerificationPrefixMode | null
  invoiceDate?: unknown
  receiptTime?: unknown
}): string | null {
  const receiptVerificationNumber = String(
    args.receiptVerificationNumber ?? '',
  ).trim()
  if (!receiptVerificationNumber) return null

  const mode = args.mode ?? DEFAULT_TANZANIA_RECEIPT_VERIFICATION_PREFIX_MODE
  const environment = mode === 'development' ? 'development' : 'production'
  const time =
    receiptTimeToken(args.invoiceDate) || receiptTimeToken(args.receiptTime)
  const verificationCode = time
    ? `${receiptVerificationNumber}_${time}`
    : receiptVerificationNumber

  return `${TANZANIA_RECEIPT_VERIFICATION_URLS[environment]}${verificationCode}`
}
