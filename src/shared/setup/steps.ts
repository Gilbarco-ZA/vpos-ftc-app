import { KV_KEYS } from '@/src/shared/setup/keys'
import { storeStationKv } from '@/src/shared/setup/storage'

const allowedSetupSteps = new Set([
  'site',
  'products',
  'pumps',
  'printer',
  'finalized',
])

export function normalizeSetupStep(step: unknown) {
  return String(step || '').trim()
}

export function isAllowedSetupStep(step: string) {
  return allowedSetupSteps.has(step)
}

export function listAllowedSetupSteps() {
  return Array.from(allowedSetupSteps)
}

export async function markSetupStep(stationId: string, step: string) {
  await Promise.all([
    storeStationKv(stationId, KV_KEYS.SETUP_STEP, step),
    storeStationKv(
      stationId,
      KV_KEYS.SETUP_UPDATED_AT,
      new Date().toISOString(),
    ),
  ])
  return { step }
}
