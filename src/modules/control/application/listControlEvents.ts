import { NextResponse } from "next/server";

import { listControlEventsRepo } from '@/src/modules/control/infrastructure/controlEventsRepo'

export async function listControlEvents(stationId: string, req: Request) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const action = url.searchParams.get('action')
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit') ?? 100) || 100, 1),
    500,
  )

  const data = await listControlEventsRepo({ stationId, status, action, limit })
  return NextResponse.json({ ok: true, data })
}
