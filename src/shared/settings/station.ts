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
  printReceiptOrder?: 'before_fiscalization' | 'after_fiscalization' | null
  tinCaptureOrder?: 'before_transaction' | 'after_transaction' | null
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
             print_receipt_order = COALESCE($7, print_receipt_order),
             tin_capture_order = COALESCE($8, tin_capture_order),
             sync_enabled = COALESCE($9, sync_enabled),
             sync_time = COALESCE($10, sync_time),
             sync_timezone = COALESCE($11, sync_timezone),
             money_decimals = COALESCE($12, money_decimals),
             unit_price_decimals = COALESCE($13, unit_price_decimals),
             volume_decimals = COALESCE($14, volume_decimals)
       WHERE station_id = $15
    `,
    [
      args.linkingWindowSeconds ?? null,
      args.unallocatedHandling ?? null,
      args.fiscalizationEngine ?? null,
      args.fiscalizationTransport ?? null,
      args.autoFiscalizeEnabled ?? null,
      args.autoPrintReceipts ?? null,
      args.printReceiptOrder ?? null,
      args.tinCaptureOrder ?? null,
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
