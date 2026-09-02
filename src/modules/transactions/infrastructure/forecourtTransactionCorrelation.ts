export const DEFAULT_FORECOURT_TRANSACTION_CORRELATION_SECONDS = 30

export function normalizeForecourtTransactionCorrelationSeconds(
  linkingWindowSeconds: number | null | undefined,
) {
  const value = Number(linkingWindowSeconds)
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_FORECOURT_TRANSACTION_CORRELATION_SECONDS
  }
  return Math.max(1, Math.trunc(value))
}

export function buildForecourtTransactionCorrelationLockKey(args: {
  stationId: string
  pumpNumber: number
  nozzleNumber?: number | null
}) {
  const nozzleNumber = Number(args.nozzleNumber)
  const normalizedNozzle =
    Number.isFinite(nozzleNumber) && nozzleNumber > 0
      ? Math.trunc(nozzleNumber)
      : 0
  return `forecourt-transaction-instance:${String(args.stationId)}:${Math.trunc(Number(args.pumpNumber))}:${normalizedNozzle}`
}
