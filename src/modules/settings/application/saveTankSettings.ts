import type { TankSettingsPayload } from '@/src/modules/settings/application/tankSettingsTypes'
import type { SessionUser } from '@/src/shared/types'

import { toFloat } from '@/src/platform/web/api/request'
import { badRequest } from '@/src/platform/web/api/response'
import { ensureTankGroup } from '@/src/shared/doms/tankGauge'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  createTankRepo,
  deleteTankRepo,
  findProductRepo,
  findTankByCodeRepo,
  getTankProductRepo,
  tankHasNozzlesRepo,
  updateTankRepo,
} from '@/src/modules/settings/infrastructure/settingsRepo'

const isValidStatus = (value: string) =>
  value === 'ACTIVE' || value === 'INACTIVE'

const normalizeStatus = (value: unknown) =>
  String(value ?? 'ACTIVE')
    .trim()
    .toUpperCase()

const parseNumber = (value: unknown) => {
  const num = toFloat(value)
  return num === undefined ? null : num
}

const validateThresholds = (
  capacity: number,
  low: number | null,
  critical: number | null,
) => {
  if (low != null && low > capacity) {
    return 'Low level must be less than or equal to capacity'
  }
  if (critical != null && critical > capacity) {
    return 'Critical level must be less than or equal to capacity'
  }
  return null
}

const extractPayload = (body: Record<string, unknown>) =>
  ((body?.data ?? body) || {}) as TankSettingsPayload

export async function createTankSetting(
  user: SessionUser,
  body: Record<string, unknown>,
) {
  const payload = extractPayload(body)
  const code = String(payload?.code ?? '').trim()
  const name = String(payload?.name ?? '').trim()
  const productId = String(payload?.productId ?? '').trim()
  const status = normalizeStatus(payload?.status)
  const capacity = parseNumber(payload?.capacityLitres)
  const low = parseNumber(payload?.lowLevelLitres)
  const critical = parseNumber(payload?.criticalLevelLitres)
  const domsTankId = String(payload?.domsTankId ?? '').trim() || null
  const manualVolumeLitres = parseNumber(payload?.manualVolumeLitres)
  const tankGroupId = await ensureTankGroup(
    user.stationId,
    payload?.tankGroupId ?? payload?.tankGroupName,
  )

  if (!code) return badRequest('Code is required')
  if (!name) return badRequest('Name is required')
  if (!productId) return badRequest('Product is required')
  if (!isValidStatus(status)) return badRequest('Invalid status')
  if (capacity === null || capacity <= 0) {
    return badRequest('Capacity must be greater than zero')
  }

  const thresholdError = validateThresholds(capacity, low, critical)
  if (thresholdError) return badRequest(thresholdError)

  const product = await findProductRepo(user.stationId, productId)
  if (!product) return badRequest('Invalid product')

  const existing = await findTankByCodeRepo(user.stationId, code)
  if (existing?.id) return badRequest('Code must be unique per station')

  const id = uuidv4()
  const row = await createTankRepo({
    id,
    stationId: user.stationId,
    code,
    name,
    productId,
    capacity,
    status,
    low,
    critical,
    tankGroupId,
    domsTankId,
    manualVolumeLitres,
    recordedBy: user.email ?? null,
  })

  return { id: String(row?.id ?? '') }
}

export async function updateTankSetting(
  user: SessionUser,
  body: Record<string, unknown>,
) {
  const payload = extractPayload(body)
  const tankId = String(payload?.id ?? '').trim()
  const code = String(payload?.code ?? '').trim()
  const name = String(payload?.name ?? '').trim()
  const productId = String(payload?.productId ?? '').trim()
  const status = normalizeStatus(payload?.status)
  const capacity = parseNumber(payload?.capacityLitres)
  const low = parseNumber(payload?.lowLevelLitres)
  const critical = parseNumber(payload?.criticalLevelLitres)
  const domsTankId = String(payload?.domsTankId ?? '').trim() || null
  const manualVolumeLitres = parseNumber(payload?.manualVolumeLitres)
  const tankGroupId = await ensureTankGroup(
    user.stationId,
    payload?.tankGroupId ?? payload?.tankGroupName,
  )

  if (!tankId) return badRequest('Tank id is required')
  if (!code) return badRequest('Code is required')
  if (!name) return badRequest('Name is required')
  if (!productId) return badRequest('Product is required')
  if (!isValidStatus(status)) return badRequest('Invalid status')
  if (capacity === null || capacity <= 0) {
    return badRequest('Capacity must be greater than zero')
  }

  const thresholdError = validateThresholds(capacity, low, critical)
  if (thresholdError) return badRequest(thresholdError)

  const product = await findProductRepo(user.stationId, productId)
  if (!product) return badRequest('Invalid product')

  const existing = await findTankByCodeRepo(user.stationId, code)
  if (existing?.id && existing.id !== tankId) {
    return badRequest('Code must be unique per station')
  }

  const current = (await getTankProductRepo(user.stationId, tankId)) as any
  if (!current?.product_id) return badRequest('Tank not found')

  if (current.product_id !== productId) {
    const inUse = await tankHasNozzlesRepo(user.stationId, tankId)
    if (inUse) {
      return badRequest(
        'Cannot change product for a tank that is in use by nozzles',
      )
    }
  }

  await updateTankRepo({
    stationId: user.stationId,
    id: tankId,
    code,
    name,
    productId,
    capacity,
    status,
    low,
    critical,
    tankGroupId,
    domsTankId,
    manualVolumeLitres,
    recordedBy: user.email ?? null,
  })

  return { id: tankId }
}

export async function deleteTankSetting(
  stationId: string,
  body: Record<string, unknown>,
) {
  const data =
    body?.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : {}
  const tankId = String(body?.id ?? data.id ?? '').trim()
  if (!tankId) return badRequest('Tank id is required')

  const inUse = await tankHasNozzlesRepo(stationId, tankId)
  if (inUse) {
    return badRequest('Cannot delete a tank that is in use by nozzles')
  }

  await deleteTankRepo(stationId, tankId)
  return { id: tankId }
}
