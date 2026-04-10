export type SyncDirection = 'push' | 'pull' | 'both'

export type RunSyncOptions = {
  stationId?: string
  force?: boolean
  direction?: SyncDirection
  limitPerTable?: number
}

export type SyncStateRow = {
  id: string
  station_id: string
  last_push_at: string | null
  last_pull_at: string | null
  sync_in_progress: boolean
}

export type CursorValue = {
  lastUpdatedAt: string | null
  lastPk: string | null
}

export type TableSpec = {
  name: string
  pk: string
  hasStationId: boolean
  columns: string[]
  direction: SyncDirection
}
