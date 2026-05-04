import type { LogType } from '@/src/shared/logs/service'
import { NextResponse } from "next/server";

import { listLogs } from '@/src/shared/logs/service'

export async function listAdminLogs(stationId: string, url: string) {
  const { searchParams } = new URL(url)
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
    out[t] = await listLogs(stationId, t, start, end)
  }

  return NextResponse.json({ success: true, data: out })
}
