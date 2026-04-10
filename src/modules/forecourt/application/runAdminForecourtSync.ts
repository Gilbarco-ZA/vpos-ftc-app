import { ensureDomsBackendAllowed } from '@/src/shared/doms/backend'

import { runForecourtSync } from './runForecourtSync'

export type RunAdminForecourtSyncBody = {
  force?: boolean
  includeTankStatus?: boolean
  data?: {
    force?: boolean
    includeTankStatus?: boolean
  }
}

export async function runAdminForecourtSync(
  stationId: string,
  body: RunAdminForecourtSyncBody,
) {
  await ensureDomsBackendAllowed(stationId)

  const force = Boolean(body?.force ?? body?.data?.force ?? false)
  const includeTankStatus = Boolean(
    body?.includeTankStatus ?? body?.data?.includeTankStatus ?? true,
  )

  return await runForecourtSync({
    stationId,
    force,
    includeTankStatus,
  })
}
