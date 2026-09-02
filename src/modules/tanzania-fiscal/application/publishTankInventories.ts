import type { AtgSnapshotPublication } from '@/src/modules/tanzania-fiscal/infrastructure/proxyTankInventories'

import { publishLatestTanzaniaTankInventories } from '@/src/modules/tanzania-fiscal/infrastructure/proxyTankInventories'

export async function publishTanzaniaTankInventoriesForCapture(
  stationId: string,
  capture: AtgSnapshotPublication,
) {
  return await publishLatestTanzaniaTankInventories(stationId, capture)
}
