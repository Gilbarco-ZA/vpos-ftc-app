import { createHash } from 'crypto'
import * as fs from 'fs/promises'
import path from 'path'
import type {
  JsonObject,
  StationConfigDbRow,
  StationConfigRow,
} from '@/src/shared/config/types'

import { deepMerge } from '@/src/platform/config/deep-merge'
import { getStationConfigDefaults } from '@/src/platform/config/defaults'
import { getEffectiveSystemConfiguration } from '@/src/platform/config/effective'
import { kvGet } from '@/src/platform/config/station-kv'
import { query, queryOne, toCamelCase } from '@/src/platform/db/postgres'
import { systemConfigSchema } from '@/src/shared/config/schema'
import {
  getPreferredNetworkHost,
  resolveProductionHost,
} from '@/src/shared/forecourt/runtimeConfigShared'
import { uuidv4 } from '@/src/shared/utils/uuid'

const DEFAULT_SCHEMA_VERSION = 'vpos-app-1'
const DEFAULT_API_PORT = 4101

type SiteProfileKv = {
  country?: string
  timezone?: string
}

type DeviceKv = {
  deviceId?: string
  deviceName?: string
}

const normalizeCountry = (value: string) =>
  String(value || '')
    .trim()
    .toUpperCase()

const configLooksUninitialized = (cfg: StationConfigRow): boolean => {
  const c: any = (cfg as any).configJson?.config
  const country = String(c?.country || '')
  const timezone = String(c?.timezone || '')
  return !country || !timezone || (country === 'US' && timezone === 'UTC')
}

const pickLanguage = (_country: string) => 'en'

const buildConfigFromStationKv = async (
  stationId: string,
): Promise<JsonObject | null> => {
  try {
    const site = await kvGet<SiteProfileKv>(stationId, 'site.profile')
    if (!site || typeof site !== 'object') return null

    const dev =
      (await kvGet<DeviceKv>(stationId, 'vpos.device.data')) ||
      (await kvGet<DeviceKv>(stationId, 'vpos.device.registration')) ||
      null

    const minimal = buildMinimalConfig()
    const country = normalizeCountry(String(site.country || ''))
    const timezone = String(site.timezone || '').trim()

    const next: any = {
      ...minimal,
      config: {
        ...(minimal.config as any),
        country: country || (minimal.config as any)?.country,
        timezone: timezone || (minimal.config as any)?.timezone,
        language: pickLanguage(country),
        rtl: false,
      },
    }

    if (dev?.deviceId) {
      next.config.deviceId = dev.deviceId
      if (dev.deviceName) next.config.deviceName = dev.deviceName
    }

    return validateStationConfig(next)
  } catch {
    return null
  }
}

export const getStationConfig = async (
  stationId: string,
): Promise<StationConfigRow | null> => {
  const row = await queryOne<StationConfigDbRow>(
    `SELECT station_id, schema_version, config_json, created_at, updated_at
     FROM station_config
     WHERE station_id = $1`,
    [stationId],
  )

  if (!row) return null
  return toCamelCase<StationConfigRow>(row as unknown as JsonObject)
}

export const saveStationConfig = async (
  stationId: string,
  configJson: JsonObject,
  schemaVersion = DEFAULT_SCHEMA_VERSION,
): Promise<void> => {
  await query(
    `INSERT INTO station_config (station_id, schema_version, config_json)
     VALUES ($1, $2, $3)
     ON CONFLICT (station_id)
     DO UPDATE SET schema_version = EXCLUDED.schema_version,
                   config_json = EXCLUDED.config_json,
                   updated_at = NOW()`,
    [stationId, schemaVersion, configJson],
  )
  const id = uuidv4()
  await query(
    `INSERT INTO station_config_versions (id, station_id, schema_version, config_json, created_by)
      VALUES ($1, $2, $3, $4, $5)`,
    [id, stationId, schemaVersion, configJson, 'bootstrap'],
  )
}

export const bootstrapStationConfig = async (
  stationId: string,
): Promise<StationConfigRow> => {
  const existing = await getStationConfig(stationId)
  if (existing) return existing

  const fromKv = await buildConfigFromStationKv(stationId)

  if (existing && fromKv && configLooksUninitialized(existing)) {
    await saveStationConfig(stationId, fromKv, DEFAULT_SCHEMA_VERSION)
    const repaired = await getStationConfig(stationId)
    if (repaired) return repaired
  }

  if (existing) return existing

  if (fromKv) {
    await saveStationConfig(stationId, fromKv, DEFAULT_SCHEMA_VERSION)
    const created = await getStationConfig(stationId)
    if (created) return created
  }

  const candidatePath = await findConfigJsonPath()
  if (candidatePath) {
    const imported = await importConfigFromJson(stationId, candidatePath)
    if (imported) return imported
  }

  let seedCountry = 'US'
  try {
    const site = await kvGet<SiteProfileKv>(stationId, 'site.profile')
    if (site?.country) seedCountry = normalizeCountry(String(site.country))
  } catch {}

  const minimalConfig = buildMinimalConfig()
  const defaults = await getStationConfigDefaults(
    seedCountry,
    DEFAULT_SCHEMA_VERSION,
  )
  const seeded = defaults?.configJson
    ? deepMerge(minimalConfig, defaults.configJson)
    : minimalConfig

  await saveStationConfig(stationId, seeded, DEFAULT_SCHEMA_VERSION)

  const created = await getStationConfig(stationId)
  if (!created) throw new Error('Failed to create minimal station_config row')
  return created
}

export async function getSystemConfiguration(stationId: string) {
  return await getEffectiveSystemConfiguration(stationId)
}

export const importConfigFromJson = async (
  stationId: string,
  configPath: string,
): Promise<StationConfigRow | null> => {
  try {
    const raw = await fs.readFile(/*turbopackIgnore: true*/ configPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    const configJson = normalizeConfigPayload(parsed)
    const checksum = hashString(raw)

    await saveStationConfig(stationId, configJson, DEFAULT_SCHEMA_VERSION)
    await logConfigImport(stationId, configPath, checksum, 'IMPORTED', null)
    return await getStationConfig(stationId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logConfigImport(
      stationId,
      configPath,
      hashString(configPath),
      'FAILED',
      message,
    )
    return null
  }
}

const validateStationConfig = (input: unknown): JsonObject => {
  return systemConfigSchema.parse(input) as JsonObject
}

const normalizeConfigPayload = (input: unknown): JsonObject => {
  if (
    typeof input === 'object' &&
    input !== null &&
    'data' in (input as Record<string, unknown>)
  ) {
    return validateStationConfig(
      (input as Record<string, unknown>).data,
    ) as JsonObject
  }
  return validateStationConfig(input)
}

const portRaw = process.env.VPOS_API_PORT
const port = portRaw ? Number(portRaw) : DEFAULT_API_PORT

if (!Number.isFinite(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid VPOS_API_PORT="${portRaw}"`)
}

const buildMinimalConfig = (): JsonObject => {
  return {
    config: {
      country: 'US',
      timezone: 'UTC',
      language: 'en',
      rtl: false,
    },
    supervisor: {
      loggerParams: {
        label: 'VPOS-PSS-SUPERVISOR',
        level: 'warn',
        console: false,
      },
      restartDelay: 5000,
      maxRestarts: 5,
      healthCheckInterval: 5000,
      startupTimeout: 60000,
    },
    processes: {
      loggerParams: {
        label: 'VPOS-PSS-PROCESS',
        level: 'warn',
        console: false,
      },
      process: {
        api: {
          name: 'VPOS API Module',
          enabled: true,
          required: true,
          autoRestart: true,
          allowedToStop: false,
          startupOrder: 0,
          debug: false,
          debugPort: 9229,
          config: {
            port: port,
            host: resolveProductionHost(
              process.env.VPOS_API_HOST,
              getPreferredNetworkHost(),
            ),
          },
          plugins: [
            {
              name: 'supervisor',
              enabled: true,
              config: {},
            },
            {
              name: 'config',
              enabled: true,
              config: {},
            },
          ],
        },
      },
    },
  }
}

const findConfigJsonPath = async (): Promise<string | null> => {
  const candidates = resolveCandidatePaths()
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate
    }
  }
  return null
}

const resolveCandidatePaths = (): string[] => {
  const candidates: string[] = []
  const envPath = process.env.VPOS_CONFIG_PATH
  const envDir = process.env.VPOS_CONFIG_DIR

  if (envPath) candidates.push(envPath)
  if (envDir) {
    candidates.push(
      path.join(/*turbopackIgnore: true*/ envDir, 'vpos.config.json'),
    )
    candidates.push(path.join(/*turbopackIgnore: true*/ envDir, 'config.json'))
  }

  const cwd = process.cwd()
  candidates.push(path.join(/*turbopackIgnore: true*/ cwd, 'vpos.config.json'))
  candidates.push(path.join(/*turbopackIgnore: true*/ cwd, 'config.json'))
  candidates.push(
    path.join(/*turbopackIgnore: true*/ cwd, 'vpos.config.example.json'),
  )
  return candidates
}

const exists = async (candidate: string): Promise<boolean> => {
  try {
    await fs.access(/*turbopackIgnore: true*/ candidate)
    return true
  } catch {
    return false
  }
}

const hashString = (value: string): string => {
  return createHash('sha256').update(value).digest('hex')
}

const logConfigImport = async (
  stationId: string,
  sourcePath: string,
  sourceChecksum: string,
  status: string,
  message: string | null,
): Promise<void> => {
  const id = uuidv4()
  await query(
    `INSERT INTO config_imports (id, station_id, source_path, source_checksum, status, message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, stationId, sourcePath, sourceChecksum, status, message],
  )
}
