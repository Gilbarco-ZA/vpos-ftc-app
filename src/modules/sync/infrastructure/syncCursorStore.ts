import type {
  CursorValue,
  SyncDirection,
} from '@/src/modules/sync/domain/syncTypes'

import { kvGet, kvSet } from '@/src/shared/storage/stationKv'

const cursorKey = (
  direction: Extract<SyncDirection, 'push' | 'pull'>,
  tableName: string,
) => `sync.cursor.${direction}.${tableName}`

export const getSyncCursor = async (
  stationId: string,
  tableName: string,
  direction: Extract<SyncDirection, 'push' | 'pull'>,
): Promise<CursorValue> => {
  const value = await kvGet<CursorValue>(
    stationId,
    cursorKey(direction, tableName),
  )
  return value ?? { lastUpdatedAt: null, lastPk: null }
}

export const setSyncCursor = async (
  stationId: string,
  tableName: string,
  direction: Extract<SyncDirection, 'push' | 'pull'>,
  value: CursorValue,
): Promise<void> => {
  await kvSet(stationId, cursorKey(direction, tableName), value)
}
