import { NextResponse } from "next/server";

import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'

import { runUserStationSync } from '@/src/modules/sync/application/runStationSync'

export const POST = async (req: Request) => {
  // RBAC: admin + manager only
  const user = await requireAuth(['administrator', 'manager'])

  const contentType = req.headers.get('content-type') || ''

  let headerToken: string | null = req.headers.get('x-csrf-token')
  let bodyToken: string | null = null

  let force = false
  let direction: 'push' | 'pull' | 'both' = 'both'

  if (contentType.includes('application/json')) {
    const body = await req.json().catch((): Record<string, any> => ({}))
    bodyToken = body.csrf_token ?? null

    force = !!body.force
    direction =
      body.direction === 'push' || body.direction === 'pull'
        ? body.direction
        : 'both'
  } else {
    const form = await req.formData()
    bodyToken = form.get('csrf_token')?.toString() || null

    force = form.get('force') === 'true'
    const d = form.get('direction')
    direction = d === 'push' || d === 'pull' ? d : 'both'
  }

  // CSRF validation (single source of truth)
  requireCsrfFromParts({
    headerToken,
    bodyToken,
  })

  const result = await runUserStationSync({
    stationId: user.stationId,
    force,
    direction,
  })

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: (result.errors ?? [])
          .map((e: any) =>
            typeof e === 'string' ? e : (e?.message ?? String(e)),
          )
          .join('; '),
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    success: true,
    recordsPushed: result.recordsPushed,
    recordsPulled: result.recordsPulled,
  })
}
