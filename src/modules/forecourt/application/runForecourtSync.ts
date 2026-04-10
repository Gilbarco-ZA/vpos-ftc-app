import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { runForecourtConfigSync } from '../infrastructure/configSyncRepo'

export async function runForecourtSync(params: {
  stationId: string
  force?: boolean
  includeTankStatus?: boolean
}) {
  return await runForecourtConfigSync({
    stationId: requireNonEmptyString(params.stationId, 'stationId'),
    force: Boolean(params.force),
    includeTankStatus: Boolean(params.includeTankStatus),
  })
}
