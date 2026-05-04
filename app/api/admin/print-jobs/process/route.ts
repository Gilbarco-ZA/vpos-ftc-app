import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { processNextPrintJob } from '@/src/modules/printing/application/processNextPrintJob'

export const POST = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const result = await processNextPrintJob(user.stationId)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
