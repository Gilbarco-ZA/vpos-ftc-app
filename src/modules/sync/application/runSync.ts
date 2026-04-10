import crypto from 'crypto'
import type {
  RunSyncOptions,
  SyncDirection,
  TableSpec,
} from '@/src/modules/sync/domain/syncTypes'
import type { SyncConflict, SyncResult } from '@/src/shared/types'

import { auditSyncEvent } from '@/src/platform/security/audit/audit-log.repository'

import {
  getCloudRow,
  getCloudRowUpdatedAt,
  listCloudRows,
  upsertCloudRow,
} from '@/src/modules/sync/infrastructure/syncCloudRepo'
import {
  getSyncCursor,
  setSyncCursor,
} from '@/src/modules/sync/infrastructure/syncCursorStore'
import {
  ensureSyncStateRow,
  getLocalRow,
  listLocalRowsForPush,
  markPullCompleted,
  markPushCompleted,
  markSyncFailed,
  markSyncStarted,
  markSyncSucceeded,
  recordSyncConflict,
  resolveDefaultStationId,
  upsertLocalRow,
} from '@/src/modules/sync/infrastructure/syncLocalRepo'
import { SYNC_TABLE_SPECS } from '@/src/modules/sync/infrastructure/syncTableSpecs'

export const runSync = async (options: RunSyncOptions): Promise<SyncResult> => {
  const stationId = options.stationId || (await resolveDefaultStationId())
  const force = !!options.force
  const direction: SyncDirection = options.direction || 'both'
  const limitPerTable = Math.max(
    1,
    Math.min(options.limitPerTable || 5000, 20000),
  )

  const runId = crypto.randomUUID()
  const conflicts: SyncConflict[] = []
  const syncState = await ensureSyncStateRow(stationId)

  if (syncState.sync_in_progress && !force) {
    return {
      success: false,
      recordsPushed: 0,
      recordsPulled: 0,
      conflicts: [],
      errors: [
        'Sync already in progress (sync_state.sync_in_progress = true). Use force to override.',
      ],
    }
  }

  await markSyncStarted({ stationId })

  await auditSyncEvent(stationId, 'SYNC_STARTED', {
    runId,
    direction,
    force,
    limitPerTable,
  })

  const errors: string[] = []
  let pushed = 0
  let pulled = 0

  try {
    if (direction === 'push' || direction === 'both') {
      for (const table of SYNC_TABLE_SPECS.filter(
        (candidate) =>
          candidate.direction === 'push' || candidate.direction === 'both',
      )) {
        const result = await pushTable({
          stationId,
          table,
          limitPerTable,
          conflicts,
        })
        pushed += result.count
      }

      await markPushCompleted(stationId)
    }

    if (direction === 'pull' || direction === 'both') {
      for (const table of SYNC_TABLE_SPECS.filter(
        (candidate) =>
          candidate.direction === 'pull' || candidate.direction === 'both',
      )) {
        const result = await pullTable({
          stationId,
          table,
          limitPerTable,
          conflicts,
        })
        pulled += result.count
      }

      await markPullCompleted(stationId)
    }

    await markSyncSucceeded({
      stationId,
      recordsPushed: pushed,
      recordsPulled: pulled,
      conflictsCount: conflicts.length,
    })

    await auditSyncEvent(stationId, 'SYNC_COMPLETED', {
      runId,
      direction,
      recordsPushed: pushed,
      recordsPulled: pulled,
      conflictsCount: conflicts.length,
    })

    return {
      success: true,
      recordsPushed: pushed,
      recordsPulled: pulled,
      conflicts,
      errors: [],
    }
  } catch (error: any) {
    const message = error?.message
      ? String(error.message)
      : 'Unknown sync error'
    errors.push(message)

    await markSyncFailed({
      stationId,
      error: message,
      conflictsCount: conflicts.length,
    })

    await auditSyncEvent(stationId, 'SYNC_FAILED', {
      runId,
      direction,
      recordsPushed: pushed,
      recordsPulled: pulled,
      conflictsCount: conflicts.length,
      error: message,
    })

    return {
      success: false,
      recordsPushed: pushed,
      recordsPulled: pulled,
      conflicts,
      errors,
    }
  }
}

export const runSyncNow = async (
  options: RunSyncOptions,
): Promise<SyncResult> => {
  return await runSync(options)
}

const pushTable = async (args: {
  stationId: string
  table: TableSpec
  limitPerTable: number
  conflicts: SyncConflict[]
}): Promise<{ count: number }> => {
  const { stationId, table, limitPerTable, conflicts } = args
  const cursor = await getSyncCursor(stationId, table.name, 'push')
  const cursorUpdatedAt = cursor.lastUpdatedAt
    ? new Date(cursor.lastUpdatedAt)
    : null

  const localRows = await listLocalRowsForPush({
    stationId,
    table,
    limitPerTable,
    cursorUpdatedAt,
    cursorPk: cursor.lastPk,
  })

  if (!localRows.length) {
    return { count: 0 }
  }

  let count = 0
  let lastRow: { updatedAt: Date; pk: string } | null = null

  for (const localRow of localRows) {
    const entityId = String(localRow[table.pk])
    const localUpdatedAt = localRow.updated_at
      ? new Date(String(localRow.updated_at))
      : null
    const cloudUpdatedAt = await getCloudRowUpdatedAt(table, entityId)

    if (cloudUpdatedAt && localUpdatedAt && cloudUpdatedAt > localUpdatedAt) {
      const conflict = await recordSyncConflict({
        stationId,
        entityType: table.name,
        entityId,
        localData: localRow,
        cloudData: await getCloudRow(table, entityId),
        localUpdatedAt,
        cloudUpdatedAt,
        resolution: 'CLOUD_WINS',
      })
      conflicts.push(conflict)
      continue
    }

    await upsertCloudRow(table, localRow)
    count++

    if (localUpdatedAt) {
      lastRow = { updatedAt: localUpdatedAt, pk: entityId }
    }
  }

  if (lastRow) {
    await setSyncCursor(stationId, table.name, 'push', {
      lastUpdatedAt: lastRow.updatedAt.toISOString(),
      lastPk: lastRow.pk,
    })
  }

  return { count }
}

const pullTable = async (args: {
  stationId: string
  table: TableSpec
  limitPerTable: number
  conflicts: SyncConflict[]
}): Promise<{ count: number }> => {
  const { stationId, table, limitPerTable, conflicts } = args
  const cursor = await getSyncCursor(stationId, table.name, 'pull')
  const cursorUpdatedAt = cursor.lastUpdatedAt
    ? new Date(cursor.lastUpdatedAt)
    : null

  const cloudRows = await listCloudRows({
    stationId,
    table,
    limitPerTable,
    cursorUpdatedAt,
    cursorPk: cursor.lastPk,
  })

  if (!cloudRows.length) {
    return { count: 0 }
  }

  let count = 0
  let lastRow: { updatedAt: Date; pk: string } | null = null

  for (const cloudRow of cloudRows) {
    const entityId = String(cloudRow[table.pk])
    const cloudUpdatedAt = cloudRow.updated_at
      ? new Date(String(cloudRow.updated_at))
      : null
    const localRow = await getLocalRow(table, entityId)
    const localUpdatedAt = localRow?.updated_at
      ? new Date(String(localRow.updated_at))
      : null

    if (cloudUpdatedAt && localUpdatedAt && localUpdatedAt > cloudUpdatedAt) {
      const conflict = await recordSyncConflict({
        stationId,
        entityType: table.name,
        entityId,
        localData: localRow ?? {},
        cloudData: cloudRow,
        localUpdatedAt,
        cloudUpdatedAt,
        resolution: 'CLOUD_WINS',
      })
      conflicts.push(conflict)
    }

    await upsertLocalRow(table, cloudRow)
    count++

    if (cloudUpdatedAt) {
      lastRow = { updatedAt: cloudUpdatedAt, pk: entityId }
    }
  }

  if (lastRow) {
    await setSyncCursor(stationId, table.name, 'pull', {
      lastUpdatedAt: lastRow.updatedAt.toISOString(),
      lastPk: lastRow.pk,
    })
  }

  return { count }
}
