import type { PreviewDomsMaintenanceCommandsInput } from '@/src/modules/forecourt/application/previewDomsMaintenanceCommands'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { previewDomsMaintenanceCommands } from '@/src/modules/forecourt/application/previewDomsMaintenanceCommands'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<PreviewDomsMaintenanceCommandsInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const result = await previewDomsMaintenanceCommands(body, user)
    return NextResponse.json({ success: true, data: result })
  },
})
