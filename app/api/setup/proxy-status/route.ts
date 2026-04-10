import { ok } from '@/src/platform/web/api/response'
import { definePublicGetRoute } from '@/src/shared/http/defineRoute'

import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'
import { getSetupProxyStatus } from '@/src/modules/setup/application/getSetupProxyStatus'

export const dynamic = 'force-dynamic'

export const GET = definePublicGetRoute({
  handler: async () => {
    const { stationId } = await resolveSetupRequestContext()
    return ok(await getSetupProxyStatus(stationId), {
      headers: { 'cache-control': 'no-store' },
    })
  },
})
