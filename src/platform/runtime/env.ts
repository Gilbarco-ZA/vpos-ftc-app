import path from 'node:path'
import { config as loadEnv } from 'dotenv'

import { getStationId } from '@/src/shared/utils/getStationId'
import { isUuid } from '@/src/shared/utils/ids'
import { logger } from '@/src/shared/utils/logger'

let envLoaded = false

export function bootstrapRuntimeEnvironment() {
  if (envLoaded) return
  loadEnv({ path: path.join(process.cwd(), '.env.local') })
  loadEnv({ path: path.join(process.cwd(), '.env') })
  envLoaded = true
}

export function parseRuntimeInterval(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback
  const normalized = value.replace(/_/g, '').trim()
  if (!normalized) return fallback
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function resolveRuntimePollMs(
  envNames: string[],
  fallback: number,
): number {
  bootstrapRuntimeEnvironment()

  for (const envName of envNames) {
    const raw = process.env[envName]
    if (!raw) continue
    return parseRuntimeInterval(raw, fallback)
  }

  return fallback
}

export function requireRuntimeStationId(runtimeName: string): string {
  bootstrapRuntimeEnvironment()
  const stationId = getStationId()

  if (!isUuid(stationId)) {
    const message = `VPOS_STATION_ID must be a UUID. Got '${stationId || 'empty'}'.`
    logger.error(`[${runtimeName}]`, { msg: message })
    throw new Error(message)
  }

  return stationId
}
