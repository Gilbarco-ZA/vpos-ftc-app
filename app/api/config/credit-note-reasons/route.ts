import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { getCreditNoteReasons } from '@/src/shared/server/config/getConfig'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager', 'tenant'])
    const data = await getCreditNoteReasons()
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
