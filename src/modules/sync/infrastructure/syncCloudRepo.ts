import type { TableSpec } from '@/src/modules/sync/domain/syncTypes'

import * as az from '@/src/shared/db/azureSql'

import { withAzureRetry } from '@/src/modules/sync/infrastructure/withAzureRetry'

export const getCloudRowUpdatedAt = async (
  table: TableSpec,
  entityId: string,
): Promise<Date | null> => {
  const query = `SELECT updated_at FROM ${table.name} WHERE ${table.pk} = @id`
  const row = await withAzureRetry(() =>
    az.queryOne<{ updated_at: unknown }>(query, { id: entityId }),
  )

  if (!row?.updated_at) {
    return null
  }

  return new Date(String(row.updated_at))
}

export const getCloudRow = async (
  table: TableSpec,
  entityId: string,
): Promise<Record<string, unknown>> => {
  const query = `SELECT ${table.columns.join(', ')} FROM ${table.name} WHERE ${table.pk} = @id`
  const row = await withAzureRetry(() =>
    az.queryOne<Record<string, unknown>>(query, { id: entityId }),
  )

  return row ?? {}
}

export const listCloudRows = async (args: {
  stationId: string
  table: TableSpec
  limitPerTable: number
  cursorUpdatedAt: Date | null
  cursorPk: string | null
}): Promise<Record<string, unknown>[]> => {
  const { stationId, table, limitPerTable, cursorUpdatedAt, cursorPk } = args

  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (table.hasStationId) {
    conditions.push('station_id = @stationId')
    params.stationId = stationId
  }

  if (cursorUpdatedAt) {
    conditions.push(
      `(updated_at > @cursorUpdatedAt OR (updated_at = @cursorUpdatedAt AND ${table.pk} > @cursorPk))`,
    )
    params.cursorUpdatedAt = toAzureSqlDate(cursorUpdatedAt)
    params.cursorPk = cursorPk
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : ''
  const query = `
    SELECT TOP (${limitPerTable}) ${table.columns.join(', ')}
    FROM ${table.name}
    ${whereClause}
    ORDER BY updated_at ASC, ${table.pk} ASC
  `

  return await withAzureRetry(() =>
    az.queryAll<Record<string, unknown>>(query, params),
  )
}

export const upsertCloudRow = async (
  table: TableSpec,
  row: Record<string, unknown>,
): Promise<void> => {
  const columns = table.columns
  const updates = columns
    .filter((column) => column !== table.pk)
    .map((column) => `${column} = src.${column}`)
    .concat(['updated_at = src.updated_at'])

  const params: Record<string, unknown> = {}
  for (const column of columns) {
    const value = row[column]

    if (value === undefined) {
      params[column] = null
    } else if (isJsonColumn(table.name, column)) {
      params[column] = value === null ? null : JSON.stringify(value)
    } else {
      params[column] = value
    }
  }

  const mergeQuery = `
    MERGE ${table.name} AS tgt
    USING (SELECT ${columns.map((column) => `@${column} AS ${column}`).join(', ')}) AS src
    ON (tgt.${table.pk} = src.${table.pk})
    WHEN MATCHED THEN UPDATE SET ${updates.join(', ')}
    WHEN NOT MATCHED THEN INSERT (${columns.join(', ')}) VALUES (${columns.map((column) => `src.${column}`).join(', ')});
  `

  await az.query(mergeQuery, params)
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

const toAzureSqlDate = (date: Date): string => {
  return date.toISOString()
}
