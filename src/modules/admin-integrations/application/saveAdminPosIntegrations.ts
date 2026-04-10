import type { SessionUser } from '@/src/shared/types'

import { fail } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import { pickPosIntegrations } from '@/src/shared/integrations/posConfig'
import { posIntegrationUpdateSchema } from '@/src/shared/validations'

import {
  getStationConfigJsonRepo,
  updateStationConfigJsonRepo,
} from '@/src/modules/admin-integrations/infrastructure/adminIntegrationsRepo'

import type { PosIntegrationInput } from './posIntegrationTypes'

const toInt = (value: unknown) => {
  if (value == null || value === '') return undefined
  const n = Number.parseInt(String(value), 10)
  return Number.isFinite(n) ? n : undefined
}

export async function saveAdminPosIntegrations(
  user: SessionUser,
  body: PosIntegrationInput,
) {
  const payload = {
    backend: body.backend,
    jpl: body.jpl
      ? {
          ...body.jpl,
          timeoutMs: toInt((body.jpl as any).timeoutMs),
          posId: toInt((body.jpl as any).posId),
          fpOperationModeNo: toInt((body.jpl as any).fpOperationModeNo),
          portOverrides: (body.jpl as any).portOverrides
            ? {
                apc1: toInt((body.jpl as any).portOverrides?.apc1),
                apc2: toInt((body.jpl as any).portOverrides?.apc2),
              }
            : undefined,
        }
      : undefined,
    ppx: body.ppx
      ? { ...body.ppx, timeoutMs: toInt((body.ppx as any).timeoutMs) }
      : undefined,
    ligo: body.ligo
      ? { ...body.ligo, timeoutMs: toInt((body.ligo as any).timeoutMs) }
      : undefined,
    namos: body.namos
      ? { ...body.namos, timeoutMs: toInt((body.namos as any).timeoutMs) }
      : undefined,
  }

  const parsed = posIntegrationUpdateSchema.safeParse(payload)
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join('; '), 400)
  }

  const { configJson: currentCfg } = await getStationConfigJsonRepo(
    user.stationId,
  )
  if (!currentCfg || typeof currentCfg !== 'object') {
    return fail('Station config not initialized', 409)
  }

  const nextCfg = {
    ...currentCfg,
    integrations: { ...(currentCfg.integrations ?? {}) },
  }
  nextCfg.integrations.posBackend =
    parsed.data.backend === 'none' ? null : parsed.data.backend
  if (parsed.data.jpl) {
    nextCfg.integrations.jpl = parsed.data.jpl
  }
  if (parsed.data.ppx) nextCfg.integrations.ppx = parsed.data.ppx
  if (parsed.data.ligo) nextCfg.integrations.ligo = parsed.data.ligo
  if (parsed.data.namos) nextCfg.integrations.namos = parsed.data.namos

  await updateStationConfigJsonRepo({
    stationId: user.stationId,
    username: user.username ?? 'administrator',
    nextConfigJson: nextCfg,
  })

  await createAuditLog({
    stationId: user.stationId,
    userId: user.id,
    action: 'CONFIG_UPDATED',
    entityType: 'station_config',
    metadata: { scope: 'integrations.pos', backend: parsed.data.backend },
  }).catch(() => {})

  return { success: true, data: pickPosIntegrations(nextCfg) }
}
