import { NextResponse } from 'next/server'

import { ensureBootstrapReady } from '@/src/platform/bootstrap/runtime'
import { queryOne } from '@/src/platform/db/postgres'
import { serverError } from '@/src/platform/web/api/response'
import { countActiveUsers } from '@/src/shared/server/users'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  try {
    const boot = await ensureBootstrapReady()

    const userCount = await countActiveUsers()

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
    })
  } catch (err) {
    return await serverError(err)
  }
}
