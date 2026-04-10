import { query } from '@/src/platform/db/postgres'

export async function listControlEventsRepo(opts: {
  stationId: string
  status?: string | null
  action?: string | null
  limit: number
}) {
  const result = await query<any>(
    `SELECT id, station_id, action, target_process, status, requested_by, requested_at, completed_at, error_message, created_at, updated_at
       FROM process_control_events
      WHERE station_id = $1
        AND ($2::text IS NULL OR status = $2)
        AND ($3::text IS NULL OR action = $3)
      ORDER BY created_at DESC
      LIMIT $4`,
    [opts.stationId, opts.status ?? null, opts.action ?? null, opts.limit],
  )

  return result.rows ?? []
}
