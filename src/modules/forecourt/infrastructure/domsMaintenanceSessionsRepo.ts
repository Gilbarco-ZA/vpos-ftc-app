import { query } from '@/src/platform/db/postgres'

export type DomsMaintenanceSessionAuditRow = {
  id: string
  station_id: string
  user_id: string | null
  username: string | null
  user_full_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string | Date
}

const MAINTENANCE_SESSION_ACTIONS = [
  'DOMS_MAINTENANCE_SESSION_REQUESTED',
  'DOMS_MAINTENANCE_SESSION_APPROVED',
  'DOMS_MAINTENANCE_SESSION_CANCELLED',
]

export async function listDomsMaintenanceSessionAuditRows(params: {
  stationId: string
  limit: number
}) {
  const result = await query<DomsMaintenanceSessionAuditRow>(
    `SELECT a.id,
            a.station_id,
            a.user_id,
            u.username,
            u.full_name AS user_full_name,
            a.action,
            a.entity_type,
            a.entity_id,
            a.old_values,
            a.new_values,
            a.metadata,
            a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.station_id = $1
        AND a.entity_type = 'forecourt.domsMaintenanceSession'
        AND a.action = ANY($2::text[])
      ORDER BY a.created_at DESC
      LIMIT $3`,
    [params.stationId, MAINTENANCE_SESSION_ACTIONS, params.limit],
  )

  return result.rows
}

export async function listDomsMaintenanceSessionAuditRowsBySession(params: {
  stationId: string
  sessionId: string
}) {
  const result = await query<DomsMaintenanceSessionAuditRow>(
    `SELECT a.id,
            a.station_id,
            a.user_id,
            u.username,
            u.full_name AS user_full_name,
            a.action,
            a.entity_type,
            a.entity_id,
            a.old_values,
            a.new_values,
            a.metadata,
            a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.station_id = $1
        AND a.entity_type = 'forecourt.domsMaintenanceSession'
        AND a.entity_id = $2
        AND a.action = ANY($3::text[])
      ORDER BY a.created_at ASC`,
    [params.stationId, params.sessionId, MAINTENANCE_SESSION_ACTIONS],
  )

  return result.rows
}
