import { queryOne } from '@/src/platform/db/postgres'

export type ConfigVersionStore = 'station' | 'plugin' | 'device'

const TABLES: Record<ConfigVersionStore, string> = {
  station: 'station_config_versions',
  plugin: 'plugin_config_versions',
  device: 'device_config_versions',
}

export async function setConfigVersionPin(input: {
  store: ConfigVersionStore
  id: string
  pinned: boolean
  reason?: string | null
}) {
  const table = TABLES[input.store]
  const id = String(input.id || '').trim()
  if (!id) throw new Error('config version id is required')
  const reason = input.pinned ? String(input.reason || '').trim() || null : null

  return await queryOne<{
    id: string
    station_id: string
    is_pinned: boolean
    pinned_at: string | null
    pin_reason: string | null
  }>(
    `UPDATE ${table}
        SET is_pinned = $2,
            pinned_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
            pin_reason = CASE WHEN $2 THEN $3 ELSE NULL END
      WHERE id::text = $1
      RETURNING id::text AS id,
                station_id::text AS station_id,
                is_pinned,
                pinned_at::text AS pinned_at,
                pin_reason`,
    [id, input.pinned, reason],
  )
}
