import type { RecordDomsDeploymentSignOffInput } from '@/src/modules/forecourt/application/recordDomsDeploymentSignOff'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { recordDomsDeploymentSignOff } from '@/src/modules/forecourt/application/recordDomsDeploymentSignOff'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<RecordDomsDeploymentSignOffInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    return NextResponse.json({
      success: true,
      data: await recordDomsDeploymentSignOff(body, user),
    })
  },
})
