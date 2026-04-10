export type SupportBundleLine = {
  label: string
  value: string | number | null | undefined
}

const asText = (value: SupportBundleLine['value']) => {
  if (value == null) return '—'
  return String(value)
}

const formatBlock = (
  title: string,
  lines: SupportBundleLine[],
  extra?: string,
) => {
  const header = `=== ${title} ===`
  const body = lines.map((l) => `${l.label}: ${asText(l.value)}`).join('\n')

  const parts = [header, body]

  if (extra && extra.trim()) {
    parts.push('', '--- Details ---', extra.trim())
  }

  return parts.join('\n')
}

export const buildNonFiscalizedSupportBundle = (tx: {
  id: string
  posReference?: string | null
  status?: string | null
  transactionDateTime?: string | null
  pumpNumber?: number | null
  fuelType?: string | null
  volume?: number | null
  totalAmount?: number | null
  retryCount?: number | null
  fiscalQueueEnqueuedAt?: string | null
  lastError?: string | null
}) => {
  return formatBlock(
    'Transaction support bundle (non-fiscalized)',
    [
      { label: 'Transaction ID', value: tx.id },
      { label: 'POS reference', value: tx.posReference },
      { label: 'Status', value: tx.status },
      { label: 'Transaction datetime', value: tx.transactionDateTime },
      { label: 'Pump', value: tx.pumpNumber },
      { label: 'Fuel', value: tx.fuelType },
      { label: 'Volume', value: tx.volume },
      { label: 'Total amount', value: tx.totalAmount },
      { label: 'Retry count', value: tx.retryCount },
      { label: 'Queue enqueued', value: tx.fiscalQueueEnqueuedAt },
    ],
    tx.lastError ?? undefined,
  )
}

export const buildFiscalizedSupportBundle = (tx: {
  id: string
  posReference?: string | null
  status?: string | null
  fiscalizedAt?: string | null
  transactionDateTime?: string | null
  cloudTransactionId?: string | null
  fiscalizationReference?: string | null
  pumpNumber?: number | null
  fuelType?: string | null
  volume?: number | null
  totalAmount?: number | null
  buyerName?: string | null
  tin?: string | null
}) => {
  return formatBlock('Transaction support bundle (fiscalized)', [
    { label: 'Transaction ID', value: tx.id },
    { label: 'POS reference', value: tx.posReference },
    { label: 'Status', value: tx.status },
    { label: 'Fiscalized at', value: tx.fiscalizedAt },
    { label: 'Transaction datetime', value: tx.transactionDateTime },
    { label: 'Cloud transaction ID', value: tx.cloudTransactionId },
    { label: 'Fiscalization reference', value: tx.fiscalizationReference },
    { label: 'Pump', value: tx.pumpNumber },
    { label: 'Fuel', value: tx.fuelType },
    { label: 'Volume', value: tx.volume },
    { label: 'Total amount', value: tx.totalAmount },
    { label: 'Buyer', value: tx.buyerName },
    { label: 'TIN', value: tx.tin },
  ])
}
