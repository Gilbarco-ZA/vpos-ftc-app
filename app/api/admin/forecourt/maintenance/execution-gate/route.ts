import type { RecordBlockedDomsMaintenanceExecutionInput } from '@/src/modules/forecourt/application/domsMaintenanceExecutionPolicy'
import { NextResponse } from 'next/server'

import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import {
  getDomsMaintenanceExecutionPolicy,
  recordBlockedDomsMaintenanceExecutionAttempt,
} from '@/src/modules/forecourt/application/domsMaintenanceExecutionPolicy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return NextResponse.json({
      success: true,
      data: await getDomsMaintenanceExecutionPolicy(user.stationId),
    })
  },
})

export const POST =
  defineMutationRoute<RecordBlockedDomsMaintenanceExecutionInput>({
    roles: ['administrator'],
    handler: async (_req, { user, body }) => {
      const result = await recordBlockedDomsMaintenanceExecutionAttempt(
        body,
        user,
      )
      return NextResponse.json({ success: true, data: result })
    },
  })
