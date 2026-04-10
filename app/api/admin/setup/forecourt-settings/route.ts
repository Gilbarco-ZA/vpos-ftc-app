import type { SaveForecourtSettingsInput } from '@/src/modules/setup/application/forecourtSettingsTypes'

import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getAdminForecourtSettings } from '@/src/modules/setup/application/getAdminForecourtSettings'
import { saveAdminForecourtSettings } from '@/src/modules/setup/application/saveAdminForecourtSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) => {
    return await getAdminForecourtSettings(user.stationId)
  },
})

export const POST = defineMutationRoute<SaveForecourtSettingsInput>({
  csrf: false,
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    return await saveAdminForecourtSettings(user.stationId, body)
  },
})
