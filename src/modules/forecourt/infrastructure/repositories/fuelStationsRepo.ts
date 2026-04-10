import { queryOne } from '@/src/platform/db/postgres'

export type FuelStationSummaryRow = {
  id: string
  name?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
}

export const fuelStationsRepo = {
  async getActiveStationId() {
    const row = await queryOne<{ id: string }>(
      'SELECT id FROM fuel_stations WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1',
    )
    return row?.id ?? null
  },

  async getCountryById(stationId: string) {
    const row = await queryOne<{ country: string | null }>(
      'SELECT country FROM fuel_stations WHERE id = $1',
      [stationId],
    )
    return row?.country ?? null
  },

  async getSummaryById(stationId: string) {
    return await queryOne<FuelStationSummaryRow>(
      'SELECT id, name, address, city, country, phone, email FROM fuel_stations WHERE id = $1',
      [stationId],
    )
  },
}
