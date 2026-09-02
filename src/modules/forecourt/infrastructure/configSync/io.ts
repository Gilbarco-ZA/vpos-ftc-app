import fs from 'node:fs/promises'
import path from 'node:path'

import { getSystemConfiguration } from '@/src/shared/config/loader'

import { jplRequest } from '@/src/modules/pos/application/posProxy'

async function getJplForecourtConfig(stationId: string) {
  const cfg = await getSystemConfiguration(stationId)
  const integrations = (cfg as any)?.integrations ?? {}
  return integrations?.jpl ?? null
}

export type SnapshotFormat = 'json' | 'dps-xml'

type ForecourtSyncIoConfig = {
  snapshotFormat?: 'json' | 'dps-xml'
  snapshotPath?: string
  snapshotMethod?: 'GET' | 'POST'
  snapshotBody?: Record<string, unknown> | null
  tankStatusPath?: string
  tankStatusMethod?: 'GET' | 'POST'
}

export const resolveSnapshotFormat = (
  cfg: ForecourtSyncIoConfig,
  pathHint?: string,
): SnapshotFormat => {
  if (cfg.snapshotFormat === 'dps-xml') return 'dps-xml'
  if (cfg.snapshotFormat === 'json') return 'json'
  if (pathHint && pathHint.toLowerCase().endsWith('.xml')) return 'dps-xml'
  return 'json'
}

export async function readSnapshotFromFile(
  pathValue: string,
  format: SnapshotFormat,
) {
  const filePath = path.isAbsolute(pathValue)
    ? pathValue
    : path.join(/*turbopackIgnore: true*/ process.cwd(), pathValue)
  const text = await fs.readFile(/*turbopackIgnore: true*/ filePath, 'utf-8')
  if (format === 'dps-xml') return text
  return JSON.parse(text)
}

export async function readSnapshotFromDomsJson(
  stationId: string,
  cfg: ForecourtSyncIoConfig,
) {
  if (!cfg.snapshotPath) {
    throw new Error('Forecourt snapshotPath is required for jpl source')
  }

  const jplCfg = await getJplForecourtConfig(stationId)
  if (!jplCfg?.host) {
    throw new Error('JPL is not configured')
  }

  return await jplRequest(
    stationId,
    cfg.snapshotPath,
    {
      method: cfg.snapshotMethod ?? 'POST',
      body: cfg.snapshotBody ?? undefined,
    },
    { accessMode: 'forecourt' },
  )
}

export async function readSnapshotFromDomsXml(
  _stationId: string,
  _cfg: ForecourtSyncIoConfig,
): Promise<string> {
  throw new Error(
    'DPS XML forecourt snapshots are no longer supported. Reconfigure forecourt sync to use JPL JSON commands or a local snapshot file.',
  )
}

export async function readTankStatusFromDoms(
  stationId: string,
  cfg: ForecourtSyncIoConfig,
) {
  if (!cfg.tankStatusPath) return null
  return await jplRequest(
    stationId,
    cfg.tankStatusPath,
    {
      method: cfg.tankStatusMethod ?? 'GET',
    },
    { accessMode: 'forecourt' },
  )
}
