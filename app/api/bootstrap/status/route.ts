import { NextResponse } from 'next/server'

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getBootstrapStatus } from '@/src/modules/bootstrap/application/getBootstrapStatus'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = async () => {
  try {
    const [{ boot, userCount, deviceStatus, station }, setupUser] =
      await Promise.all([
        getBootstrapStatus(),
        requireAuth(['administrator', 'manager']).catch(() => null),
      ])

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
      canManageSetup: Boolean(setupUser),
      proxyCountryCode: deviceStatus.proxyCountryCode || null,
      stationCountry: station?.country || null,
    })
  } catch (err) {
    return await serverError(err)
  }
}
