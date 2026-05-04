import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { retryLegacyImport } from '@/src/modules/legacy-import/application/retryLegacyImport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const body = await req.json().catch((): Record<string, any> => ({}))
    const ledgerId = body?.ledgerId as string | undefined
    if (!ledgerId) {
      return NextResponse.json(
        { success: false, error: 'ledgerId required' },
        { status: 400 },
      )
    }

    const result = await retryLegacyImport({
      stationId: user.stationId,
      ledgerId,
    })

    if (!result.found) {
      return NextResponse.json(
        { success: false, error: 'Ledger entry not found' },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
