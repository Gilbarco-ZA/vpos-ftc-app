import type { StationSettings } from '@/src/shared/types'

import { queryOne } from '@/src/platform/db/postgres'

export async function getStationSettings(stationId: string) {
  return await queryOne<any>(
    `SELECT * FROM station_settings WHERE station_id = $1`,
    [stationId],
  )
}

export async function updateStationSettings(
  stationId: string,
  patch: Partial<StationSettings>,
) {
  const row = await queryOne<any>(
    `
    UPDATE station_settings
    SET
      linking_window_seconds = COALESCE($2, linking_window_seconds),
      proxy_url = COALESCE($3, proxy_url),
      proxy_base_path = COALESCE($4, proxy_base_path),
      vat_rate_tz = COALESCE($5, vat_rate_tz),
      vat_rate_ke = COALESCE($6, vat_rate_ke),
      vat_rate_default = COALESCE($7, vat_rate_default),
      auto_print_receipts = COALESCE($8, auto_print_receipts),
      updated_at = NOW()
    WHERE station_id = $1
    RETURNING *
    `,
    [
      stationId,
      patch.linkingWindowSeconds ?? null,
      patch.proxyUrl ?? null,
      patch.proxyBasePath ?? null,
      patch.vatRateTz ?? null,
      patch.vatRateKe ?? null,
      patch.vatRateDefault ?? null,
      patch.autoPrintReceipts ?? null,
    ],
  )
  return row
}
