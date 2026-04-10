import type { SyncDirection } from '@/src/modules/sync/domain/syncTypes'
import type { SyncResult } from '@/src/shared/types'

import { runSync, runSyncNow } from '@/src/modules/sync/application/runSync'

export async function runAdminStationSync(args: {
  stationId: string
  direction?: SyncDirection
  force?: boolean
  limitPerTable?: number
}): Promise<SyncResult> {
  return await runSyncNow({
    stationId: args.stationId,
    direction: args.direction,
    force: args.force,
    limitPerTable: args.limitPerTable,
  })
}

export async function runUserStationSync(args: {
  stationId: string
  direction?: SyncDirection
  force?: boolean
}): Promise<SyncResult> {
  return await runSync({
    stationId: args.stationId,
    direction: args.direction,
    force: args.force,
  })
}
