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
  fiscalizationTransport?: string | null
  autoFiscalizeEnabled?: boolean | null
  autoPrintReceipts?: boolean | null
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
             fiscalization_transport = COALESCE($4, fiscalization_transport),
             auto_fiscalize_enabled = COALESCE($5, auto_fiscalize_enabled),
             auto_print_receipts = COALESCE($6, auto_print_receipts),
             sync_enabled = COALESCE($7, sync_enabled),
             sync_time = COALESCE($8, sync_time),
             sync_timezone = COALESCE($9, sync_timezone),
             money_decimals = COALESCE($10, money_decimals),
             unit_price_decimals = COALESCE($11, unit_price_decimals),
             volume_decimals = COALESCE($12, volume_decimals)
       WHERE station_id = $13
    `,
    [
      args.linkingWindowSeconds ?? null,
      args.unallocatedHandling ?? null,
      args.fiscalizationEngine ?? null,
      args.fiscalizationTransport ?? null,
      args.autoFiscalizeEnabled ?? null,
      args.autoPrintReceipts ?? null,
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
