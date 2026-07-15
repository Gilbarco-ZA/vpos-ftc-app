import type { SessionUser } from '@/src/shared/types'

import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { readBody, toInt } from '@/src/platform/web/api/request'
import {
  badRequest,
  forbidden,
  ok,
  serverError,
} from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { ensureTankGroup } from '@/src/shared/doms/tankGauge'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'
import { uuidv4 } from '@/src/shared/utils/uuid'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ensurePump = async (stationId: string, pumpId: string) => {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM pumps WHERE id = $1 AND station_id = $2`,
    [pumpId, stationId],
  )
  return row?.id ?? null
}

const ensureTank = async (stationId: string, tankId: string) => {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM tanks WHERE id = $1 AND station_id = $2`,
    [tankId, stationId],
  )
  return row?.id ?? null
}

export const GET = async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }
    const pumpId = String((await ctx.params).id || '').trim()
    if (!pumpId) return badRequest('Pump id is required')

    const pump = await ensurePump(user.stationId, pumpId)
    if (!pump) return badRequest('Pump not found')

    const rows = await queryAll<Record<string, unknown>>(
      `SELECT n.id,
              n.nozzle_number,
              n.tank_id,
              n.tank_group_id,
              t.name as tank_name,
              p.product_name,
              p.product_code,
              tg.name as tank_group_name
         FROM nozzles n
         JOIN tanks t ON t.id = n.tank_id
         JOIN products p ON p.id = t.product_id
    LEFT JOIN tank_groups tg ON tg.id = n.tank_group_id
        WHERE n.station_id = $1 AND n.pump_id = $2
        ORDER BY n.nozzle_number ASC`,
      [user.stationId, pumpId],
    )

    return ok({
      nozzles: rows.map((row) => ({
        id: String(row.id),
        nozzleNumber: Number(row.nozzle_number ?? 0),
        tankId: String(row.tank_id ?? ''),
        tankName: String(row.tank_name ?? ''),
        productName: String(row.product_name ?? ''),
        productCode: String(row.product_code ?? ''),
        tankGroupId: row.tank_group_id ? String(row.tank_group_id) : '',
        tankGroupName: String(row.tank_group_name ?? ''),
      })),
    })
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
    if (!user) {
      return await serverError('User not found')
    }
    const pumpId = String((await ctx.params).id || '').trim()
    if (!pumpId) return badRequest('Pump id is required')

    const body = await readBody(req)
    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body?.csrf_token,
    })

    const payload = body?.data ?? body
    const nozzleNumber = toInt(payload?.nozzleNumber)
    const tankId = String(payload?.tankId ?? '').trim()
    const tankGroupId = await ensureTankGroup(
      user.stationId,
      payload?.tankGroupId ?? payload?.tankGroupName,
    )

    if (!nozzleNumber || nozzleNumber <= 0) {
      return badRequest('Nozzle number is required')
    }
    if (!tankId) return badRequest('Tank is required')

    const pump = await ensurePump(user.stationId, pumpId)
    if (!pump) return badRequest('Pump not found')

    const tank = await ensureTank(user.stationId, tankId)
    if (!tank) return badRequest('Invalid tank')

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM nozzles
        WHERE station_id = $1 AND pump_id = $2 AND nozzle_number = $3`,
      [user.stationId, pumpId, nozzleNumber],
    )
    if (existing?.id) {
      return badRequest('Nozzle number must be unique per pump')
    }

    const id = uuidv4()
    const row = await queryOne<Record<string, unknown>>(
      `INSERT INTO nozzles (id, station_id, pump_id, tank_id, nozzle_number, tank_group_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [id, user.stationId, pumpId, tankId, nozzleNumber, tankGroupId],
    )

    return ok({ id: String(row?.id ?? '') })
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (msg.includes('CSRF')) return forbidden('CSRF validation failed')
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
    if (!user) {
      return await serverError('User not found')
    }
    const pumpId = String((await ctx.params).id || '').trim()
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
    const tankGroupId = await ensureTankGroup(
      user.stationId,
      payload?.tankGroupId ?? payload?.tankGroupName,
    )

    if (!nozzleId) return badRequest('Nozzle id is required')
    if (!nozzleNumber || nozzleNumber <= 0) {
      return badRequest('Nozzle number is required')
    }
    if (!tankId) return badRequest('Tank is required')

    const pump = await ensurePump(user.stationId, pumpId)
    if (!pump) return badRequest('Pump not found')

    const tank = await ensureTank(user.stationId, tankId)
    if (!tank) return badRequest('Invalid tank')

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM nozzles
        WHERE station_id = $1 AND pump_id = $2 AND nozzle_number = $3`,
      [user.stationId, pumpId, nozzleNumber],
    )
    if (existing?.id && existing.id !== nozzleId) {
      return badRequest('Nozzle number must be unique per pump')
    }

    await queryOne(
      `UPDATE nozzles
          SET tank_id = $1,
              nozzle_number = $2,
              tank_group_id = $3,
              updated_at = NOW()
        WHERE id = $4 AND station_id = $5 AND pump_id = $6`,
      [tankId, nozzleNumber, tankGroupId, nozzleId, user.stationId, pumpId],
    )

    return ok({ id: nozzleId })
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (msg.includes('CSRF')) return forbidden('CSRF validation failed')
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
    if (!user) {
      return await serverError('User not found')
    }
    const pumpId = String((await ctx.params).id || '').trim()
    if (!pumpId) return badRequest('Pump id is required')

    const body = await readBody(req)
    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body?.csrf_token,
    })

    const nozzleId = String(body?.id ?? body?.data?.id ?? '').trim()
    if (!nozzleId) return badRequest('Nozzle id is required')

    await queryOne(
      `DELETE FROM nozzles
        WHERE id = $1 AND station_id = $2 AND pump_id = $3`,
      [nozzleId, user.stationId, pumpId],
    )

    return ok({ id: nozzleId })
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (msg.includes('CSRF')) return forbidden('CSRF validation failed')
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
