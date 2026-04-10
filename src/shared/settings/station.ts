import { query, queryOne } from '@/src/platform/db/postgres'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export type StationSettingsRow = Record<string, unknown>

export async function getStationSettings(stationId: string) {
  return await queryOne<StationSettingsRow>(
    `SELECT * FROM station_settings WHERE station_id = $1`,
    [requireNonEmptyString(stationId, 'stationId')],
  )
}

export async function updateStationSettings(args: {
  stationId: string
  linkingWindowSeconds?: number | null
  unallocatedHandling?: string | null
  fiscalizationEngine?: string | null
  autoFiscalizeEnabled?: boolean | null
  syncEnabled?: boolean | null
  syncTime?: string | null
  syncTimezone?: string | null
  moneyDecimals?: number | null
  unitPriceDecimals?: number | null
  volumeDecimals?: number | null
}) {
  await query(
    `
      UPDATE station_settings
         SET linking_window_seconds = COALESCE($1, linking_window_seconds),
             unallocated_handling = COALESCE($2, unallocated_handling),
             fiscalization_engine = COALESCE($3, fiscalization_engine),
             auto_fiscalize_enabled = COALESCE($4, auto_fiscalize_enabled),
             sync_enabled = COALESCE($5, sync_enabled),
             sync_time = COALESCE($6, sync_time),
             sync_timezone = COALESCE($7, sync_timezone),
             money_decimals = COALESCE($8, money_decimals),
             unit_price_decimals = COALESCE($9, unit_price_decimals),
             volume_decimals = COALESCE($10, volume_decimals)
       WHERE station_id = $11
    `,
    [
      args.linkingWindowSeconds ?? null,
      args.unallocatedHandling ?? null,
      args.fiscalizationEngine ?? null,
      args.autoFiscalizeEnabled ?? null,
      args.syncEnabled ?? null,
      args.syncTime ?? null,
      args.syncTimezone ?? null,
      args.moneyDecimals ?? null,
      args.unitPriceDecimals ?? null,
      args.volumeDecimals ?? null,
      requireNonEmptyString(args.stationId, 'stationId'),
    ],
  )
}
