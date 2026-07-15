import { query, queryOne } from '@/src/platform/db/postgres'

export type DomsMappingHistoryRow = {
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

export async function listDomsMappingHistoryRows(params: {
  stationId: string
  limit: number
  entityType?: string | null
  entityId?: string | null
}) {
  const filters = [
    'a.station_id = $1',
    `a.action IN ('DOMS_MAPPING_UPDATED', 'DOMS_MAPPING_ROLLED_BACK', 'DOMS_MAPPING_BULK_APPLIED')`,
  ]
  const values: unknown[] = [params.stationId]

  if (params.entityType) {
    values.push(params.entityType)
    filters.push(`a.entity_type = $${values.length}`)
  }

  if (params.entityId) {
    values.push(params.entityId)
    filters.push(`a.entity_id = $${values.length}`)
  }

  values.push(params.limit)

  const result = await query<DomsMappingHistoryRow>(
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
      WHERE ${filters.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT $${values.length}`,
    values,
  )

  return result.rows
}

export async function getDomsMappingAuditRow(params: {
  stationId: string
  auditLogId: string
}) {
  return await queryOne<DomsMappingHistoryRow>(
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
        AND a.id = $2
        AND a.action = 'DOMS_MAPPING_UPDATED'
      LIMIT 1`,
    [params.stationId, params.auditLogId],
  )
}
