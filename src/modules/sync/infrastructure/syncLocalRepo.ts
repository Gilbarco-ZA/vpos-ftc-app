import type {
  SyncStateRow,
  TableSpec,
} from '@/src/modules/sync/domain/syncTypes'
import type { SyncConflict } from '@/src/shared/types'

import {
  query as pgQuery,
  queryOne as pgQueryOne,
  withTransaction as pgTx,
} from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export const resolveDefaultStationId = async (): Promise<string> => {
  const row = await pgQueryOne<{ id: string }>(
    'SELECT id FROM fuel_stations WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
  )

  if (!row?.id) {
    throw new Error('No fuel station found locally. Seed fuel_stations first.')
  }

  return row.id
}

export const ensureSyncStateRow = async (
  stationId: string,
): Promise<SyncStateRow> => {
  const existing = await pgQueryOne<SyncStateRow>(
    `SELECT id, station_id, last_push_at, last_pull_at, sync_in_progress
       FROM sync_state
      WHERE station_id = $1`,
    [stationId],
  )

  if (existing) {
    return existing
  }

  const inserted = await pgQueryOne<SyncStateRow>(
    `INSERT INTO sync_state (id, station_id, sync_in_progress, records_pushed, records_pulled, conflicts_count)
     VALUES ($1, $2, FALSE, 0, 0, 0)
     RETURNING id, station_id, last_push_at, last_pull_at, sync_in_progress`,
    [uuidv4(), stationId],
  )

  if (!inserted) {
    throw new Error('Failed to initialize sync_state')
  }

  return inserted
}

export const markSyncStarted = async (args: {
  stationId: string
}): Promise<void> => {
  await pgQuery(
    `UPDATE sync_state
        SET sync_in_progress = TRUE,
            last_sync_status = NULL,
            last_sync_error = NULL
      WHERE station_id = $1`,
    [args.stationId],
  )
}

export const markPushCompleted = async (stationId: string): Promise<void> => {
  await pgQuery(
    'UPDATE sync_state SET last_push_at = NOW() WHERE station_id = $1',
    [stationId],
  )
}

export const markPullCompleted = async (stationId: string): Promise<void> => {
  await pgQuery(
    'UPDATE sync_state SET last_pull_at = NOW() WHERE station_id = $1',
    [stationId],
  )
}

export const markSyncSucceeded = async (args: {
  stationId: string
  recordsPushed: number
  recordsPulled: number
  conflictsCount: number
}): Promise<void> => {
  await pgQuery(
    `UPDATE sync_state
        SET last_sync_status = 'SUCCESS',
            sync_in_progress = FALSE,
            records_pushed = $2,
            records_pulled = $3,
            conflicts_count = $4,
            updated_at = NOW()
      WHERE station_id = $1`,
    [
      args.stationId,
      args.recordsPushed,
      args.recordsPulled,
      args.conflictsCount,
    ],
  )
}

export const markSyncFailed = async (args: {
  stationId: string
  error: string
  conflictsCount: number
}): Promise<void> => {
  await pgQuery(
    `UPDATE sync_state
        SET last_sync_status = 'FAILED',
            last_sync_error = $2,
            sync_in_progress = FALSE,
            conflicts_count = $3,
            updated_at = NOW()
      WHERE station_id = $1`,
    [args.stationId, args.error, args.conflictsCount],
  )
}

export const recordSyncConflict = async (args: {
  stationId: string
  entityType: string
  entityId: string
  localData: Record<string, unknown>
  cloudData: Record<string, unknown>
  localUpdatedAt: Date
  cloudUpdatedAt: Date
  resolution: 'LOCAL_WINS' | 'CLOUD_WINS' | 'MANUAL'
}): Promise<SyncConflict> => {
  const row = await pgQueryOne<SyncConflict>(
    `INSERT INTO sync_conflicts (
        id,
        station_id,
        entity_type,
        entity_id,
        local_data,
        cloud_data,
        local_updated_at,
        cloud_updated_at,
        resolution
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING
        id,
        station_id as "stationId",
        entity_type as "entityType",
        entity_id as "entityId",
        local_data as "localData",
        cloud_data as "cloudData",
        local_updated_at as "localUpdatedAt",
        cloud_updated_at as "cloudUpdatedAt",
        resolution,
        resolved_at as "resolvedAt",
        resolved_by as "resolvedBy",
        created_at as "createdAt"`,
    [
      uuidv4(),
      args.stationId,
      args.entityType,
      args.entityId,
      args.localData,
      args.cloudData,
      args.localUpdatedAt.toISOString(),
      args.cloudUpdatedAt.toISOString(),
      args.resolution,
    ],
  )

  if (!row) {
    throw new Error('Failed to insert sync_conflict')
  }

  return row
}

export const listLocalRowsForPush = async (args: {
  stationId: string
  table: TableSpec
  limitPerTable: number
  cursorUpdatedAt: Date | null
  cursorPk: string | null
}): Promise<Record<string, unknown>[]> => {
  const { stationId, table, limitPerTable, cursorUpdatedAt, cursorPk } = args

  const whereParts: string[] = []
  const params: unknown[] = []
  let parameterIndex = 1

  if (table.hasStationId) {
    whereParts.push(`station_id = $${parameterIndex++}`)
    params.push(stationId)
  }

  if (cursorUpdatedAt) {
    whereParts.push(
      `(updated_at > $${parameterIndex} OR (updated_at = $${parameterIndex} AND ${table.pk} > $${parameterIndex + 1}))`,
    )
    params.push(cursorUpdatedAt.toISOString())
    params.push(cursorPk)
    parameterIndex += 2
  }

  const whereClause = whereParts.length
    ? `WHERE ${whereParts.join(' AND ')}`
    : ''
  const query = `SELECT ${table.columns.join(', ')} FROM ${table.name} ${whereClause} ORDER BY updated_at ASC, ${table.pk} ASC LIMIT $${parameterIndex}`
  params.push(limitPerTable)

  const result = await pgQuery<Record<string, unknown>>(query, params)
  return result.rows
}

export const getLocalRow = async (
  table: TableSpec,
  entityId: string,
): Promise<Record<string, unknown> | null> => {
  return await pgQueryOne<Record<string, unknown>>(
    `SELECT ${table.columns.join(', ')} FROM ${table.name} WHERE ${table.pk} = $1`,
    [entityId],
  )
}

export const upsertLocalRow = async (
  table: TableSpec,
  cloudRow: Record<string, unknown>,
): Promise<void> => {
  const columns = table.columns
  const values = columns.map((column) =>
    normalizeCloudValue(table.name, column, cloudRow[column]),
  )
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
  const updates = columns
    .filter((column) => column !== table.pk)
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ')

  const query = `
    INSERT INTO ${table.name} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (${table.pk})
    DO UPDATE SET ${updates}
  `

  await pgTx(async (client) => {
    await client.query(query, values)
  })
}

const normalizeCloudValue = (
  tableName: string,
  column: string,
  value: unknown,
): unknown => {
  if (!isJsonColumn(tableName, column)) {
    return value ?? null
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(`Invalid JSON in cloud for ${tableName}.${column}`)
    }
  }

  return value ?? null
}

const isJsonColumn = (tableName: string, column: string): boolean => {
  if (
    tableName === 'receipts' &&
    (column === 'fiscal_data' || column === 'branding_snapshot')
  ) {
    return true
  }

  if (
    tableName === 'fiscalization_events' &&
    (column === 'request_payload' || column === 'response_payload')
  ) {
    return true
  }

  if (tableName === 'transactions' && column === 'fiscalization_response') {
    return false
  }

  return false
}
