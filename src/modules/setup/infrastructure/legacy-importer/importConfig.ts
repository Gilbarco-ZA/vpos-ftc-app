import fs from 'fs/promises'
import path from 'path'
import type { ImportContext } from '@/src/modules/setup/infrastructure/legacy-importer/types'

import { query } from '@/src/platform/db/postgres'
import {
  upsertDeviceConfig,
  upsertPluginConfig,
} from '@/src/shared/config/pluginDevice'
import { kvSet } from '@/src/shared/storage/stationKv'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { fileHasContent } from '@/src/modules/setup/infrastructure/legacy-importer/helpers'
import { relativeToPermDir } from '@/src/modules/setup/infrastructure/legacy-importer/ledger'
import { moveAside } from '@/src/modules/setup/infrastructure/legacy-importer/moveAside'
import { VPOS_APP_FILES } from '@/src/modules/setup/infrastructure/legacy-importer/types'
import { fiscalTzArtifactKvValue } from '@/src/modules/tanzania-fiscal/infrastructure/fiscalTzLegacy'

import {
  looksLikeEngineConfig,
  transformEngineConfigToSystemConfig,
} from './engineConfigTransform'

export async function importVposConfigAndUsersAndFiscal(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  onInserted: (key: string) => void
  onMoved: (key: string) => void
  onWarn: (warning: string) => void
}) {
  const { ctx, stationId, legacyPermDir, onInserted, onMoved, onWarn } = opts

  // Config: prefer vpos.config.json, fallback engine.config.json
  const vposConfigPath = path.join(
    /*turbopackIgnore: true*/ legacyPermDir,
    VPOS_APP_FILES.VPOS_CONFIG,
  )
  const engineConfigPath = path.join(
    /*turbopackIgnore: true*/
    legacyPermDir,
    VPOS_APP_FILES.ENGINE_CONFIG,
  )
  const configPath = (await fileHasContent(vposConfigPath))
    ? vposConfigPath
    : (await fileHasContent(engineConfigPath))
      ? engineConfigPath
      : null

  if (configPath) {
    try {
      const raw = await fs.readFile(
        /*turbopackIgnore: true*/ configPath,
        'utf-8',
      )
      const parsed = JSON.parse(raw)

      const configJson = looksLikeEngineConfig(parsed)
        ? transformEngineConfigToSystemConfig(parsed)
        : parsed

      await query(
        `INSERT INTO station_config (station_id, schema_version, config_json)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (station_id)
				 DO UPDATE SET schema_version = EXCLUDED.schema_version,
				               config_json = EXCLUDED.config_json,
				               updated_at = NOW()`,
        [stationId, 'vpos-app-1', configJson],
      )
      onInserted('station_config')

      await importPluginAndDeviceConfigsFromLegacyConfig({
        stationId,
        configJson,
        onInserted,
        onWarn,
      })

      await moveAside({
        moveRoot: ctx.moveAsideRoot,
        runId: ctx.runId,
        status: 'imported',
        relativePath: relativeToPermDir(legacyPermDir, configPath) || '',
        from: configPath,
      })
      onMoved('station_config_file')
    } catch (e: any) {
      onWarn(
        `Failed to import station config (${path.basename(configPath)}): ${e?.message ?? e}`,
      )
    }
  }

  // Users
  const usersPath = path.join(
    /*turbopackIgnore: true*/ legacyPermDir,
    VPOS_APP_FILES.USERS,
  )
  if (await fileHasContent(usersPath)) {
    try {
      const raw = await fs.readFile(
        /*turbopackIgnore: true*/ usersPath,
        'utf-8',
      )
      const parsed = JSON.parse(raw)
      const users = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.users)
          ? parsed.users
          : []

      let inserted = 0
      for (const u of users) {
        const username = String(u?.username ?? u?.user ?? '').trim()
        if (!username) continue
        const email = String(u?.email ?? `${username}@local`).trim()
        const role = String(u?.role ?? 'tenant')
        const fullName = u?.fullName ?? u?.full_name ?? null
        const passwordHash = String(
          u?.passwordHash ?? u?.password_hash ?? '',
        ).trim()
        const password = String(u?.password ?? '').trim()

        let toStore = passwordHash
        if (!toStore) {
          if (!password) {
            onWarn(`Skipping user '${username}' (no password/passwordHash)`)
            continue
          }
          const { hashPassword } = await import('@/src/shared/auth')
          toStore = await hashPassword(password)
        }

        await query(
          `INSERT INTO users (id, station_id, username, email, password_hash, role, full_name, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7, TRUE)
					 ON CONFLICT (station_id, username)
					 DO UPDATE SET email = EXCLUDED.email,
					               password_hash = EXCLUDED.password_hash,
					               role = EXCLUDED.role,
					               full_name = EXCLUDED.full_name,
					               updated_at = NOW()`,
          [uuidv4(), stationId, username, email, toStore, role, fullName],
        )
        inserted += 1
      }
      if (inserted > 0) onInserted('users')

      await moveAside({
        moveRoot: ctx.moveAsideRoot,
        runId: ctx.runId,
        status: 'imported',
        relativePath: relativeToPermDir(legacyPermDir, usersPath) || '',
        from: usersPath,
      })
      onMoved('users_config_file')
    } catch (e: any) {
      onWarn(`Failed to import users.config.json: ${e?.message ?? e}`)
    }
  }

  // Fiscal config
  const fiscalConfigPath = path.join(
    /*turbopackIgnore: true*/
    legacyPermDir,
    VPOS_APP_FILES.FISCAL_CONFIG,
  )
  if (await fileHasContent(fiscalConfigPath)) {
    try {
      const raw = await fs.readFile(
        /*turbopackIgnore: true*/ fiscalConfigPath,
        'utf-8',
      )
      const parsed = JSON.parse(raw)
      await query(
        `INSERT INTO fiscal_config (station_id, config_json)
				 VALUES ($1, $2)
				 ON CONFLICT (station_id)
				 DO UPDATE SET config_json = EXCLUDED.config_json,
				               updated_at = NOW()`,
        [stationId, parsed],
      )
      await kvSet(
        stationId,
        'vpos.tra.config',
        fiscalTzArtifactKvValue(VPOS_APP_FILES.FISCAL_CONFIG, parsed),
      )
      onInserted('fiscal_config')
      await moveAside({
        moveRoot: ctx.moveAsideRoot,
        runId: ctx.runId,
        status: 'imported',
        relativePath: relativeToPermDir(legacyPermDir, fiscalConfigPath) || '',
        from: fiscalConfigPath,
      })
      onMoved('fiscal_config_file')
    } catch (e: any) {
      onWarn(`Failed to import fiscal.config.json: ${e?.message ?? e}`)
    }
  }

  // Fiscal registration
  const fiscalRegPath = path.join(
    /*turbopackIgnore: true*/
    legacyPermDir,
    VPOS_APP_FILES.FISCAL_REGISTRATION,
  )
  if (await fileHasContent(fiscalRegPath)) {
    try {
      const raw = await fs.readFile(
        /*turbopackIgnore: true*/ fiscalRegPath,
        'utf-8',
      )
      const parsed = JSON.parse(raw)
      await query(
        `INSERT INTO fiscal_registration (id, station_id, status, registration_json)
				 VALUES ($1, $2, $3, $4)
				 ON CONFLICT (station_id)
				 DO UPDATE SET status = EXCLUDED.status,
				               registration_json = EXCLUDED.registration_json,
				               updated_at = NOW()`,
        [uuidv4(), stationId, String(parsed?.status ?? 'IMPORTED'), parsed],
      )
      await kvSet(
        stationId,
        'vpos.device.registration',
        fiscalTzArtifactKvValue(VPOS_APP_FILES.FISCAL_REGISTRATION, parsed),
      )
      onInserted('fiscal_registration')
      await moveAside({
        moveRoot: ctx.moveAsideRoot,
        runId: ctx.runId,
        status: 'imported',
        relativePath: relativeToPermDir(legacyPermDir, fiscalRegPath) || '',
        from: fiscalRegPath,
      })
      onMoved('fiscal_registration_file')
    } catch (e: any) {
      onWarn(`Failed to import fiscal.registration.json: ${e?.message ?? e}`)
    }
  }
}

async function importPluginAndDeviceConfigsFromLegacyConfig(opts: {
  stationId: string
  configJson: any
  onInserted: (key: string) => void
  onWarn: (warning: string) => void
}) {
  const { stationId, configJson, onInserted, onWarn } = opts

  const procMap = configJson?.processes?.process
  if (procMap && typeof procMap === 'object') {
    for (const [processType, proc] of Object.entries<any>(procMap)) {
      const plugins = Array.isArray(proc?.plugins) ? proc.plugins : []
      for (const p of plugins) {
        const pluginName = String((p as any)?.name ?? '').trim()
        if (!pluginName) continue
        const enabled = (p as any)?.enabled !== false
        const cfg =
          (p as any)?.config && typeof (p as any).config === 'object'
            ? (p as any).config
            : {}
        try {
          await upsertPluginConfig({
            stationId,
            processType,
            pluginName,
            enabled,
            configJson: cfg,
            schemaVersion: 1,
            createdBy: 'legacy-import',
          })
          onInserted('plugin_configs')
        } catch (e: any) {
          onWarn(
            `Failed to import plugin config ${processType}/${pluginName}: ${String(e?.message ?? e)}`,
          )
        }
      }
    }
  }

  const devicesRoot =
    configJson?.devices && typeof configJson.devices === 'object'
      ? configJson.devices
      : configJson?.processes?.devices &&
          typeof configJson.processes.devices === 'object'
        ? configJson.processes.devices
        : null

  if (devicesRoot && typeof devicesRoot === 'object') {
    for (const [deviceType, v] of Object.entries<any>(devicesRoot)) {
      if (Array.isArray(v)) {
        for (const item of v) {
          const deviceKey = String(
            item?.deviceKey ?? item?.key ?? item?.name ?? item?.id ?? '',
          ).trim()
          if (!deviceKey) continue
          const enabled = item?.enabled !== false
          const cfg =
            item?.config && typeof item.config === 'object'
              ? item.config
              : item && typeof item === 'object'
                ? item
                : {}
          try {
            await upsertDeviceConfig({
              stationId,
              deviceType,
              deviceKey,
              enabled,
              configJson: cfg,
              schemaVersion: 1,
              createdBy: 'legacy-import',
            })
            onInserted('device_configs')
          } catch (e: any) {
            onWarn(
              `Failed to import device config ${deviceType}/${deviceKey}: ${String(e?.message ?? e)}`,
            )
          }
        }
      } else if (v && typeof v === 'object') {
        for (const [deviceKey, cfg] of Object.entries<any>(v)) {
          const dk = String(deviceKey).trim()
          if (!dk) continue
          try {
            await upsertDeviceConfig({
              stationId,
              deviceType,
              deviceKey: dk,
              enabled: cfg?.enabled !== false,
              configJson:
                cfg?.config && typeof cfg.config === 'object'
                  ? cfg.config
                  : cfg,
              schemaVersion: 1,
              createdBy: 'legacy-import',
            })
            onInserted('device_configs')
          } catch (e: any) {
            onWarn(
              `Failed to import device config ${deviceType}/${dk}: ${String(e?.message ?? e)}`,
            )
          }
        }
      }
    }
  }
}
