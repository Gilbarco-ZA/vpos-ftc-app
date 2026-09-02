import { query, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export async function loadTanzaniaFiscalRows(stationId: string) {
  const [
    station,
    settings,
    fiscalConfigRow,
    fiscalRegistrationRow,
    ewuraConfigRow,
    ewuraRegistrationRow,
    signingKey,
  ] = await Promise.all([
    queryOne<Record<string, any>>(
      `SELECT fs.id,
              fs.code,
              fs.name,
              fs.address,
              fs.city,
              COALESCE(
                NULLIF(BTRIM(fs.country), ''),
                NULLIF(BTRIM(sc.config_json #>> '{config,country}'), ''),
                NULLIF(BTRIM(sc.config_json #>> '{country}'), '')
              ) AS country,
              fs.phone,
              fs.email,
              fs.timezone
         FROM fuel_stations fs
         LEFT JOIN station_config sc ON sc.station_id = fs.id
        WHERE fs.id = $1`,
      [stationId],
    ),
    queryOne<Record<string, any>>(
      `SELECT fiscalization_engine, fiscalization_transport, vat_rate_tz, auto_fiscalize_enabled
         FROM station_settings
        WHERE station_id = $1`,
      [stationId],
    ),
    queryOne<Record<string, any>>(
      'SELECT station_id, config_json, created_at, updated_at FROM fiscal_config WHERE station_id = $1',
      [stationId],
    ),
    queryOne<Record<string, any>>(
      `SELECT station_id, status, registration_json, registered_at, created_at, updated_at
         FROM fiscal_registration
        WHERE station_id = $1`,
      [stationId],
    ),
    queryOne<Record<string, any>>(
      'SELECT station_id, config_json, created_at, updated_at FROM ewura_config WHERE station_id = $1',
      [stationId],
    ),
    queryOne<Record<string, any>>(
      `SELECT station_id, status, registration_json, registered_at, created_at, updated_at
         FROM ewura_registration
        WHERE station_id = $1`,
      [stationId],
    ),
    queryOne<Record<string, any>>(
      `SELECT id, created_at
         FROM secure_artifacts
        WHERE station_id = $1
          AND artifact_type = 'cert'
          AND artifact_key = 'private-key.pem'
          AND rotated_at IS NULL
          AND deleted_at IS NULL
        LIMIT 1`,
      [stationId],
    ).catch(() => null),
  ])

  return {
    station,
    settings,
    fiscalConfigRow,
    fiscalRegistrationRow,
    ewuraConfigRow,
    ewuraRegistrationRow,
    signingKey,
  }
}

export async function saveTanzaniaFiscalConfig(input: {
  stationId: string
  transport: string
  vatRate: number
  fiscalConfigJson: Record<string, unknown>
  ewuraConfigJson: Record<string, unknown>
}) {
  await query(
    `INSERT INTO station_settings (
        id, station_id, fiscalization_engine, fiscalization_transport, vat_rate_tz
      )
      VALUES ($1, $2, 'TZ', $3, $4)
     ON CONFLICT (station_id)
     DO UPDATE SET fiscalization_engine = 'TZ',
                   fiscalization_transport = EXCLUDED.fiscalization_transport,
                   vat_rate_tz = EXCLUDED.vat_rate_tz,
                   updated_at = NOW()`,
    [uuidv4(), input.stationId, input.transport, input.vatRate],
  )
  await query(
    `INSERT INTO fiscal_config (station_id, config_json)
          VALUES ($1, $2::jsonb)
     ON CONFLICT (station_id)
     DO UPDATE SET config_json = EXCLUDED.config_json,
                   updated_at = NOW()`,
    [input.stationId, input.fiscalConfigJson],
  )
  await query(
    `INSERT INTO ewura_config (station_id, config_json)
          VALUES ($1, $2::jsonb)
     ON CONFLICT (station_id)
     DO UPDATE SET config_json = EXCLUDED.config_json,
                   updated_at = NOW()`,
    [input.stationId, input.ewuraConfigJson],
  )
}
