import type { LogType } from '@/src/shared/logs/service'
import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { listLogs } from '@/src/shared/logs/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * List available log filenames.
 * GET /api/logs/list?type=live|archive|restart&start=ISO&end=ISO
 *
 * If type is omitted, returns all 3 types.
 */
export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }

    const { searchParams } = new URL(req.url)
    const typeParam = (searchParams.get('type') || '').toLowerCase().trim()
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')

    const start = startParam ? new Date(startParam) : undefined
    const end = endParam ? new Date(endParam) : undefined

    const isValidDate = (d?: Date) => !d || Number.isFinite(d.getTime())
    if (!isValidDate(start) || !isValidDate(end)) {
      return NextResponse.json(
        { success: false, error: 'Invalid start/end date' },
        { status: 400 },
      )
    }

    const types: LogType[] =
      typeParam === 'live' || typeParam === 'archive' || typeParam === 'restart'
        ? [typeParam as LogType]
        : ['live', 'archive', 'restart']

    const out: Record<string, Awaited<ReturnType<typeof listLogs>>> = {}
    for (const t of types) {
      out[t] = await listLogs(user.stationId, t, start, end)
    }

    return NextResponse.json({ success: true, data: out })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
