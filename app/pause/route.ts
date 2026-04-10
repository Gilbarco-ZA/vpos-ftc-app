import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Legacy vpos-app endpoint: GET /pause
 * vpos-ftc-app does not implement a global worker pause here; this endpoint is intentionally a no-op
 * compatibility response to keep legacy clients from failing.
 */
export async function GET() {
  return NextResponse.json({
    status: 'paused',
    timestamp: new Date().toISOString(),
  })
}
