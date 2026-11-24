import { NextResponse } from 'next/server'

import { getReadiness } from '@/src/platform/observability/health'
import { getStationId } from '@/src/shared/utils/getStationId'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  try {
    const readiness = await getReadiness(getStationId())
    return NextResponse.json(
      { ok: readiness.ok, success: readiness.ok, data: readiness },
      { status: readiness.ok ? 200 : 503 },
    )
  } catch {
    return NextResponse.json(
      { ok: false, success: false, error: { message: 'Readiness check failed' } },
      { status: 500 },
    )
  }
}
