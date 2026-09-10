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
import { KV_KEYS } from '@/src/shared/setup/keys'
import { validateRegistrationCode } from '@/src/shared/setup/validate'
import { kvGetMany } from '@/src/shared/storage/stationKv'

import { enrichRegistrationStatus } from '@/src/modules/setup/application/enrichRegistrationStatus'
import { getDeviceOperationalStatus } from '@/src/modules/setup/application/getDeviceOperationalStatus'
import { registerPublicSetupDevice } from '@/src/modules/setup/application/registerPublicSetupDevice'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const [result, cached] = await Promise.all([
      getRegistrationStatusViaProxy(user.stationId).catch((error: unknown) => ({
        ok: false,
        status: 0,
        data: {
          message:
            error instanceof Error
              ? error.message
              : 'Unable to reach VPOS proxy registration endpoint',
        },
        url: '',
      })),
      kvGetMany<any>(user.stationId, [
        KV_KEYS.VPOS_DEVICE_DATA,
        KV_KEYS.VPOS_DEVICE_REGISTRATION,
        KV_KEYS.PROXY_IDENTITY,
      ]),
    ])

    const enrich = (value: unknown) =>
      enrichRegistrationStatus(value, {
        stationId: user!.stationId,
        stationName: user!.station?.name,
        deviceData: cached[KV_KEYS.VPOS_DEVICE_DATA],
        registrationData: cached[KV_KEYS.VPOS_DEVICE_REGISTRATION],
        proxyIdentity: cached[KV_KEYS.PROXY_IDENTITY],
        updatedAt: new Date().toISOString(),
      })

    const data =
      result.data && typeof result.data === 'object' && result.data.details
        ? { ...result.data, details: enrich(result.data.details) }
        : enrich(result.data)
    const registrationPayload =
      data && typeof data === 'object' && 'details' in data
        ? (data as Record<string, any>).details
        : data
    const operationalStatus = await getDeviceOperationalStatus({
      stationId: user.stationId,
      registrationPayload,
      registrationUrl: result.url,
    })

    const responseData =
      data && typeof data === 'object' && 'details' in data
        ? {
            ...(data as Record<string, any>),
            details: {
              ...(registrationPayload as Record<string, any>),
              operationalStatus,
            },
          }
        : {
            ...(data as Record<string, any>),
            operationalStatus,
          }

    return NextResponse.json({ ...result, data: responseData })
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
