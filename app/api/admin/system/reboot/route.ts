import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Compatibility endpoint for deployments where an older reboot route remains
 * after applying an overlay update. Full station reboots are intentionally no
 * longer supported; use the service restart endpoint instead.
 */
export const POST = async () =>
  NextResponse.json(
    {
      ok: false,
      error: {
        code: 'ENDPOINT_RETIRED',
        message:
          'Full station reboot is disabled. Use /api/admin/system/restart-service to restart VPOS FTC safely.',
      },
    },
    { status: 410 },
  )
