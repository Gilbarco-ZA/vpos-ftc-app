import { NextResponse } from 'next/server'

import { ensureBootstrapReady } from '@/src/platform/bootstrap/runtime'
import { queryOne } from '@/src/platform/db/postgres'
import { serverError } from '@/src/platform/web/api/response'
import { checkProxyDeviceStatus } from '@/src/shared/proxy/client'
import { countActiveUsers } from '@/src/shared/server/users'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = async () => {
  try {
    const [boot, userCount, deviceStatus] = await Promise.all([
      ensureBootstrapReady(),
      countActiveUsers(),
      checkProxyDeviceStatus(),
    ])

    const station = boot.stationId
      ? await queryOne<{ name: string }>(
          `SELECT name FROM fuel_stations WHERE id = $1`,
          [boot.stationId],
        )
      : null

    return NextResponse.json({
      ...boot,
      stationName: station?.name || null,
      userCount,
      defaultAdminEnabled: Boolean(
        (process.env.DEFAULT_ADMIN_PASSWORD || '').trim(),
      ),
      proxyReachable: deviceStatus.proxyReachable,
      proxyUrl: deviceStatus.proxyUrl,
      proxyError: deviceStatus.error,
      isRegistered: deviceStatus.isRegistered,
    })
  } catch (err) {
    return await serverError(err)
  }
}
