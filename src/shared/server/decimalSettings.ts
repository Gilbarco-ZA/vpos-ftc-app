import { getStationSettings } from '@/src/shared/config/stationSettings'
import {
  DecimalSettings,
  resolveDecimalSettings,
} from '@/src/shared/receipts/decimalSettings'

const pickDecimalOverride = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export async function getStationDecimalSettings(
  stationId: string,
): Promise<DecimalSettings> {
  const settings = await getStationSettings(stationId).catch(() => null)

  return resolveDecimalSettings({
    money: pickDecimalOverride((settings as any)?.money_decimals),
    unitPrice: pickDecimalOverride((settings as any)?.unit_price_decimals),
    volume: pickDecimalOverride((settings as any)?.volume_decimals),
  })
}
