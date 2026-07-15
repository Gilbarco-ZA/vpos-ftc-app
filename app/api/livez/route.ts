import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lightweight process liveness endpoint for the DOMS start.sh supervisor.
 *
 * This intentionally does not touch Postgres, workers, integrations, printers,
 * or proxy fiscalization. start.sh only needs to know that the HTTP server has
 * bound and can answer requests. Deeper runtime health stays on /api/healthz
 * and /api/readyz.
 */
export const GET = async () => {
  return NextResponse.json({ ok: true, success: true, status: 'running' })
}
