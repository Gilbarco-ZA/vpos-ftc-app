import { requireNonEmptyString, toPositiveInt } from '@/src/shared/utils/inputs'

import type { DomsMappingHistoryRow } from '../infrastructure/reconciliationHistoryRepo'
import { listDomsMappingHistoryRows } from '../infrastructure/reconciliationHistoryRepo'

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const formatHistoryRow = (row: DomsMappingHistoryRow) => {
  const oldValues = asRecord(row.old_values)
  const newValues = asRecord(row.new_values)
  const metadata = asRecord(row.metadata)

  return {
    id: row.id,
    stationId: row.station_id,
    userId: row.user_id,
    username: row.username,
    userFullName: row.user_full_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    oldValues,
    newValues,
    metadata,
    sourceSuggestionCode: metadata.sourceSuggestionCode ?? null,
    confirmationNote: metadata.confirmationNote ?? null,
    rollbackOfAuditLogId: metadata.rollbackOfAuditLogId ?? null,
    safetyBoundary: metadata.safetyBoundary ?? null,
    createdAt: row.created_at,
    canRollback: row.action === 'DOMS_MAPPING_UPDATED',
  }
}

export async function listDomsMappingHistory(
  stationId: string,
  searchParams: URLSearchParams,
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const limit = toPositiveInt(searchParams.get('limit'), 25, 100)
  const entityType = searchParams.get('entityType') || null
  const entityId = searchParams.get('entityId') || null

  const rows = await listDomsMappingHistoryRows({
    stationId: normalizedStationId,
    limit,
    entityType,
    entityId,
  })

  return {
    success: true,
    data: {
      stationId: normalizedStationId,
      filters: { entityType, entityId, limit },
      history: rows.map(formatHistoryRow),
      safetyNotice:
        'History is FTC-side mapping history only. Rollbacks update FTC mapping fields and do not send DOMS/PSS install or clear-install commands.',
    },
  }
}
