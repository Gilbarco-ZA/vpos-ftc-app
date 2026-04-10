import type { PumpSettingsPayload } from '@/src/modules/settings/application/pumpSettingsTypes'

import { toBool, toInt } from '@/src/platform/web/api/request'
import { badRequest } from '@/src/platform/web/api/response'
import { ensureTankGroup } from '@/src/shared/doms/tankGauge'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  createPumpRepo,
  findPumpByCodeRepo,
  findPumpByNumberRepo,
  updatePumpRepo,
} from '@/src/modules/settings/infrastructure/settingsRepo'

const isValidStatus = (value: string) =>
  value === 'ACTIVE' || value === 'INACTIVE'

const normalizeStatus = (value: unknown) =>
  String(value ?? 'ACTIVE')
    .trim()
    .toUpperCase()

const extractPayload = (body: Record<string, unknown>) =>
  ((body?.data ?? body) || {}) as PumpSettingsPayload

export async function createPumpSetting(
  stationId: string,
  body: Record<string, unknown>,
) {
  const payload = extractPayload(body)
  const code = String(payload?.code ?? '').trim()
  const name = String(payload?.name ?? '').trim()
  const status = normalizeStatus(payload?.status)
  const pumpNumber = toInt(payload?.pumpNumber)
  const hasNozzleSelector = Boolean(toBool(payload?.hasNozzleSelector, false))
  const tankGroupId = await ensureTankGroup(
    stationId,
    payload?.tankGroupId ?? payload?.tankGroupName,
  )

  if (!code) return badRequest('Code is required')
  if (!name) return badRequest('Name is required')
  if (!isValidStatus(status)) return badRequest('Invalid status')
  if (!pumpNumber || pumpNumber <= 0) {
    return badRequest('Pump number must be greater than zero')
  }

  const existingCode = await findPumpByCodeRepo(stationId, code)
  if (existingCode?.id) {
    return badRequest('Code must be unique per station')
  }

  const existingNumber = await findPumpByNumberRepo(stationId, pumpNumber)
  if (existingNumber?.id) {
    return badRequest('Pump number must be unique per station')
  }

  const id = uuidv4()
  const row = await createPumpRepo({
    id,
    stationId,
    code,
    name,
    status,
    hasNozzleSelector,
    pumpNumber,
    tankGroupId,
  })

  return { id: String(row?.id ?? '') }
}

export async function updatePumpSetting(
  stationId: string,
  body: Record<string, unknown>,
) {
  const payload = extractPayload(body)
  const pumpId = String(payload?.id ?? '').trim()
  const code = String(payload?.code ?? '').trim()
  const name = String(payload?.name ?? '').trim()
  const status = normalizeStatus(payload?.status)
  const pumpNumber = toInt(payload?.pumpNumber)
  const hasNozzleSelector = Boolean(toBool(payload?.hasNozzleSelector, false))
  const tankGroupId = await ensureTankGroup(
    stationId,
    payload?.tankGroupId ?? payload?.tankGroupName,
  )

  if (!pumpId) return badRequest('Pump id is required')
  if (!code) return badRequest('Code is required')
  if (!name) return badRequest('Name is required')
  if (!isValidStatus(status)) return badRequest('Invalid status')
  if (!pumpNumber || pumpNumber <= 0) {
    return badRequest('Pump number must be greater than zero')
  }

  const existingCode = await findPumpByCodeRepo(stationId, code)
  if (existingCode?.id && existingCode.id !== pumpId) {
    return badRequest('Code must be unique per station')
  }

  const existingNumber = await findPumpByNumberRepo(stationId, pumpNumber)
  if (existingNumber?.id && existingNumber.id !== pumpId) {
    return badRequest('Pump number must be unique per station')
  }

  await updatePumpRepo({
    stationId,
    id: pumpId,
    code,
    name,
    status,
    hasNozzleSelector,
    pumpNumber,
    tankGroupId,
  })

  return { id: pumpId }
}
