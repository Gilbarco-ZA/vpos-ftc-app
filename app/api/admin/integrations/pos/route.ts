import type { PosIntegrationInput } from '@/src/modules/admin-integrations/application/posIntegrationTypes'

import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getAdminPosIntegrations } from '@/src/modules/admin-integrations/application/getAdminPosIntegrations'
import { saveAdminPosIntegrations } from '@/src/modules/admin-integrations/application/saveAdminPosIntegrations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) =>
    ok(await getAdminPosIntegrations(user.stationId)),
})

export const POST = defineMutationRoute<PosIntegrationInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const result = await saveAdminPosIntegrations(user, body)
    return result instanceof Response ? result : ok(result)
  },
})
