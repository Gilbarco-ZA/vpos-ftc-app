export const fuelStationsSql = {
  selectActiveStationId:
    'SELECT id FROM fuel_stations WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1',
  selectCountryById: 'SELECT country FROM fuel_stations WHERE id = $1',
  selectSummaryById:
    'SELECT id, name, address, city, country, phone, email FROM fuel_stations WHERE id = $1',
} as const
