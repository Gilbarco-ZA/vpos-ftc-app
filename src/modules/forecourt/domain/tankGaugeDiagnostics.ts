import { createHash } from 'node:crypto'

export const TANK_GAUGE_DIAGNOSTIC_SCHEMA_VERSION = 2

const stableJson = (value: unknown): string => {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`
}

export const hashTankGaugePayload = (value: unknown) =>
  createHash('sha256')
    .update(stableJson(value ?? null))
    .digest('hex')

export type TankGaugeDiagnosticInput = {
  tgId: string
  capturedAt?: string | null
  liveVolumeLitres?: number | null
  productLevel?: number | null
  waterLevel?: number | null
  waterVolumeLitres?: number | null
  availableRoomLitres?: number | null
  averageTemperatureC?: number | null
  pressure?: number | null
  productCode?: string | null
  gaugeType?: string | null
  gaugeOnline?: boolean | null
  inventoryDataReady?: boolean | null
  gaugeAlarmActive?: boolean | null
  gaugeErrorActive?: boolean | null
  sourcePayload?: unknown
}

export function buildTankGaugeDiagnostics(input: TankGaugeDiagnosticInput) {
  const sourcePayloadHash = hashTankGaugePayload(input.sourcePayload)
  return {
    schemaVersion: TANK_GAUGE_DIAGNOSTIC_SCHEMA_VERSION,
    tgId: input.tgId,
    capturedAt: input.capturedAt ?? null,
    liveVolumeLitres: input.liveVolumeLitres ?? null,
    productLevel: input.productLevel ?? null,
    waterLevel: input.waterLevel ?? null,
    waterVolumeLitres: input.waterVolumeLitres ?? null,
    availableRoomLitres: input.availableRoomLitres ?? null,
    averageTemperatureC: input.averageTemperatureC ?? null,
    pressure: input.pressure ?? null,
    productCode: input.productCode ?? null,
    gaugeType: input.gaugeType ?? null,
    gaugeOnline: input.gaugeOnline ?? null,
    inventoryDataReady: input.inventoryDataReady ?? null,
    gaugeAlarmActive: input.gaugeAlarmActive ?? null,
    gaugeErrorActive: input.gaugeErrorActive ?? null,
    sourcePayloadHash,
  }
}
