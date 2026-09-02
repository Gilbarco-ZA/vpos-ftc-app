import type { SessionUser } from '@/src/shared/types'

import { readBody, toInt } from '@/src/platform/web/api/request'
import {
  badRequest,
  forbidden,
  ok,
  serverError,
} from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'

import {
  createPumpNozzle,
  deletePumpNozzle,
  listPumpNozzles,
  updatePumpNozzle,
} from '@/src/modules/settings/application/pumpNozzles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getPumpId = async (ctx: { params: Promise<{ id: string }> }) =>
  String((await ctx.params).id || '').trim()

export const GET = async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) return await serverError('User not found')
    const pumpId = await getPumpId(ctx)
    if (!pumpId) return badRequest('Pump id is required')

    const result = await listPumpNozzles(user.stationId, pumpId)
    if (!result.ok) return badRequest(result.error)
    return ok({ nozzles: result.nozzles })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}

export const POST = async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) return await serverError('User not found')
    const pumpId = await getPumpId(ctx)
    if (!pumpId) return badRequest('Pump id is required')

    const body = await readBody(req)
    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body?.csrf_token,
    })
    const payload = body?.data ?? body
    const nozzleNumber = toInt(payload?.nozzleNumber)
    const tankId = String(payload?.tankId ?? '').trim()
    if (!nozzleNumber || nozzleNumber <= 0) {
      return badRequest('Nozzle number is required')
    }
    if (!tankId) return badRequest('Tank is required')

    const result = await createPumpNozzle({
      stationId: user.stationId,
      pumpId,
      nozzleNumber,
      tankId,
      tankGroup: payload?.tankGroupId ?? payload?.tankGroupName,
    })
    if (!result.ok) return badRequest(result.error)
    return ok({ id: result.id })
  } catch (err: any) {
    if (String(err?.message || '').includes('CSRF')) {
      return forbidden('CSRF validation failed')
    }
    return await serverError(err, { req, stationId: user?.stationId })
  }
}

export const PUT = async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) return await serverError('User not found')
    const pumpId = await getPumpId(ctx)
    if (!pumpId) return badRequest('Pump id is required')

    const body = await readBody(req)
    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body?.csrf_token,
    })
    const payload = body?.data ?? body
    const nozzleId = String(payload?.id ?? '').trim()
    const nozzleNumber = toInt(payload?.nozzleNumber)
    const tankId = String(payload?.tankId ?? '').trim()
    if (!nozzleId) return badRequest('Nozzle id is required')
    if (!nozzleNumber || nozzleNumber <= 0) {
      return badRequest('Nozzle number is required')
    }
    if (!tankId) return badRequest('Tank is required')

    const result = await updatePumpNozzle({
      stationId: user.stationId,
      pumpId,
      nozzleId,
      nozzleNumber,
      tankId,
      tankGroup: payload?.tankGroupId ?? payload?.tankGroupName,
    })
    if (!result.ok) return badRequest(result.error)
    return ok({ id: result.id })
  } catch (err: any) {
    if (String(err?.message || '').includes('CSRF')) {
      return forbidden('CSRF validation failed')
    }
    return await serverError(err, { req, stationId: user?.stationId })
  }
}

export const DELETE = async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) return await serverError('User not found')
    const pumpId = await getPumpId(ctx)
    if (!pumpId) return badRequest('Pump id is required')

    const body = await readBody(req)
    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body?.csrf_token,
    })
    const nozzleId = String(body?.id ?? body?.data?.id ?? '').trim()
    if (!nozzleId) return badRequest('Nozzle id is required')

    const result = await deletePumpNozzle({
      stationId: user.stationId,
      pumpId,
      nozzleId,
    })
    if (!result.ok) return badRequest(result.error)
    return ok({ id: result.id })
  } catch (err: any) {
    if (String(err?.message || '').includes('CSRF')) {
      return forbidden('CSRF validation failed')
    }
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
