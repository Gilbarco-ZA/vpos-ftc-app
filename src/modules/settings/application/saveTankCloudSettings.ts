import type { TankConfig } from '@/src/shared/settings/tanksConfig'
import type { SessionUser } from '@/src/shared/types'

import { fail, ok } from '@/src/platform/web/api/response'
import {
  defaultTankConfig,
  normalizeTankConfig,
  sanitizeTankConfigForSave,
  validateTankCloudLimits,
} from '@/src/shared/settings/tanksConfig'

import {
  getTankConfigRepo,
  saveTankConfigRepo,
} from '@/src/modules/settings/infrastructure/settingsRepo'

const ensureArray = <T>(value: unknown, fallback: T[] = []) =>
  Array.isArray(value) ? (value as T[]) : fallback

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

export async function saveTankCloudSettings(
  user: SessionUser,
  body: Record<string, unknown>,
) {
  const stored = (await getTankConfigRepo(user.stationId)) as any
  const existing = normalizeTankConfig(stored ?? defaultTankConfig)

  if (user.role === 'manager') {
    const config = asObject(body.config)
    const data = asObject(body.data)
    const activeTanks = ensureArray<boolean>(
      body.activeTanks ?? config.activeTanks ?? data.activeTanks,
    ).map((v) => !!v)
    const next = normalizeTankConfig({
      ...existing,
      activeTanks,
    })
    await saveTankConfigRepo(user.stationId, next)
    return ok(next)
  }

  const payload = asObject(
    body.config ?? body.data ?? body,
  ) as Partial<TankConfig>
  const next = sanitizeTankConfigForSave(payload)
  const errors = validateTankCloudLimits(next)
  if (errors.length) return fail(errors.join('; '), 400)
  await saveTankConfigRepo(user.stationId, next)
  return ok(next)
}
