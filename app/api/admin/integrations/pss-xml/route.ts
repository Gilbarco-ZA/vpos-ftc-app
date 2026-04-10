import type { PssXmlActionBody } from '@/src/modules/admin-integrations/application/pssXmlTypes'

import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getAdminPssXmlStatus } from '@/src/modules/admin-integrations/application/getAdminPssXmlStatus'
import { runAdminPssXmlAction } from '@/src/modules/admin-integrations/application/runAdminPssXmlAction'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) =>
    ok(await getAdminPssXmlStatus(user.stationId)),
})

export const POST = defineMutationRoute<PssXmlActionBody>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    const result = await runAdminPssXmlAction(user, body)
    return result instanceof Response ? result : ok(result)
  },
})
