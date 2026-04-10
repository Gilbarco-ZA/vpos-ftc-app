import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import {
  badRequest,
  fail,
  ok,
  serverError,
} from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import {
  deregisterDeviceViaProxy,
  getRegistrationStatusViaProxy,
  refreshIdentityViaProxy,
  resetDeviceViaProxy,
} from '@/src/shared/proxy/client'
import { validateRegistrationCode } from '@/src/shared/setup/validate'

import { registerPublicSetupDevice } from '@/src/modules/setup/application/registerPublicSetupDevice'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const result = await getRegistrationStatusViaProxy(user?.stationId)
    return NextResponse.json(result)
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}

export const POST = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const body = await req.json().catch((): Record<string, any> => ({}))
    const action = String(body?.action || '').trim()

    if (!action) {
      return badRequest('Missing action')
    }

    if (action === 'deregister') {
      const result = await deregisterDeviceViaProxy(user?.stationId)
      return NextResponse.json(result)
    }

    if (action === 'reset') {
      const result = await resetDeviceViaProxy(user?.stationId)
      return NextResponse.json(result)
    }

    if (action === 'refreshIdentity') {
      const result = await refreshIdentityViaProxy(user?.stationId)
      return NextResponse.json(result)
    }

    if (action === 'register') {
      const validation = validateRegistrationCode(
        String(body?.registrationCode || body?.RegistrationCode || ''),
      )

      if (!validation.ok) {
        return fail(validation.error, 400)
      }

      const result = await registerPublicSetupDevice(user.stationId, {
        RegistrationCode: validation.code,
      })

      if (!result.success) {
        return fail(
          result.error || 'Device registration failed',
          result.status || 502,
        )
      }

      return ok(result.data)
    }

    return badRequest(`Unsupported action: ${action}`)
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
