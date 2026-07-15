import { NextResponse } from 'next/server'

import { getStartupStatus } from '@/src/platform/bootstrap/startup-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () =>
  NextResponse.json({ ok: true, data: getStartupStatus() })
