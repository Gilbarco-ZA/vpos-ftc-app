import type { PrinterConnectionConfig } from './printerConfig'
import { parsePrinterDeviceConfig } from './printerConfig'
import { printJobsRepo } from './printJobsRepo'

export type PrinterConfigRow = {
  device_key?: string | null
  config_json?: Record<string, unknown> | null
}

export type ResolvedPrinter = {
  deviceKey: string
  config: PrinterConnectionConfig
}

const toFiniteNumber = (value: unknown): number | null => {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? n : null
}

export const parseAssignedPumpIds = (
  configJson: Record<string, unknown> | null | undefined,
): number[] => {
  const raw =
    (configJson as any)?.fpIds ??
    (configJson as any)?.assignedPumpIds ??
    (configJson as any)?.pumpIds

  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .map((item) => toFiniteNumber(item))
          .filter((item): item is number => item != null && item > 0),
      ),
    )
  }

  if (typeof raw === 'string') {
    return Array.from(
      new Set(
        raw
          .split(/[\s,]+/g)
          .map((item) => toFiniteNumber(item))
          .filter((item): item is number => item != null && item > 0),
      ),
    )
  }

  return []
}

export const isDefaultPrinterRow = (row: PrinterConfigRow): boolean => {
  const cfg = (row?.config_json ?? {}) as any
  return cfg?.isDefault === true || String(row?.device_key ?? '') === 'default'
}

const rowToResolved = (
  row: PrinterConfigRow | undefined,
): ResolvedPrinter | null => {
  if (!row) return null
  const config = parsePrinterDeviceConfig(row.config_json || {})
  if (!config?.host) return null
  return {
    deviceKey: String(row.device_key ?? '').trim(),
    config,
  }
}

export async function resolvePrinterForTransaction(args: {
  stationId: string
  transactionId?: string | null
  explicitPrinterKey?: string | null
  pumpNumberHint?: number | null
}): Promise<ResolvedPrinter | null> {
  const { stationId } = args
  if (!stationId) return null

  const rows = (await printJobsRepo.listEnabledPrinterConfigRows(
    stationId,
  )) as PrinterConfigRow[]
  if (!rows.length) return null

  const explicitKey = String(args.explicitPrinterKey ?? '').trim()
  if (explicitKey) {
    const match = rows.find(
      (row) => String(row?.device_key ?? '').trim() === explicitKey,
    )
    const resolved = rowToResolved(match)
    if (resolved) return resolved
  }

  let pumpNumber = args.pumpNumberHint ?? null
  if ((pumpNumber == null || pumpNumber <= 0) && args.transactionId) {
    pumpNumber = await printJobsRepo.getTransactionPumpNumber(
      stationId,
      args.transactionId,
    )
  }

  if (pumpNumber != null && pumpNumber > 0) {
    const assigned = rows.find((row) =>
      parseAssignedPumpIds(row.config_json || {}).includes(pumpNumber!),
    )
    const resolved = rowToResolved(assigned)
    if (resolved) return resolved
  }

  const defaultRow = rows.find(isDefaultPrinterRow) ?? rows[0]
  return rowToResolved(defaultRow)
}
