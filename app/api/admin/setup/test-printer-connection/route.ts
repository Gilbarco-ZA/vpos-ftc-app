import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { testPrinterConnection } from '@/src/modules/setup/application/testPrinterConnection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['administrator', 'manager'],
  csrf: false,
  handler: async (_req, { user, body }) =>
    ok(await testPrinterConnection(user.stationId, body || {})),
})
