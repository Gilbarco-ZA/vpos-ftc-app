import type { SystemConfiguration } from '@/src/shared/config/schema'

import { systemConfigSchema } from '@/src/shared/config/schema'
import {
  getPreferredNetworkHost,
  resolveProductionHost,
} from '@/src/shared/forecourt/runtimeConfigShared'

/**
 * vpos-app historically supported an "engine.config.json" format.
 * vpos-ftc-app's runtime expects the newer vpos.config.json shape
 * validated by systemConfigSchema.
 *
 * This transformer provides a best-effort mapping so we can import legacy
 * stations without accepting an invalid station_config payload.
 */
export function transformEngineConfigToSystemConfig(
  oldConfig: any,
): SystemConfiguration {
  const level = String(oldConfig?.logger?.level ?? 'warn')
  const domsHost = resolveProductionHost(
    oldConfig?.doms?.host,
    getPreferredNetworkHost(),
  )
  const posIdRaw =
    oldConfig?.doms?.options?.PosId ?? oldConfig?.doms?.posId ?? '12'
  const eptIdRaw = oldConfig?.doms?.options?.EptId ?? oldConfig?.doms?.eptId

  const portRaw = process.env.VPOS_API_PORT
  const port = portRaw ? Number(portRaw) : 4101

  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid VPOS_API_PORT="${portRaw}"`)
  }

  const newConfig: any = {
    supervisor: {
      loggerParams: {
        label: 'VPOS-PSS-SUPERVISOR',
        level,
        console: false,
      },
      restartDelay: 5000,
      maxRestarts: 5,
      healthCheckInterval: 5000,
      startupTimeout: 60000,
    },
    config: {
      country: 'Tanzania',
      timezone: 'Africa/Dar_es_Salaam',
      language: 'en',
      rtl: false,
    },
    processes: {
      loggerParams: {
        label: 'VPOS-PSS-PROCESS',
        level,
        console: false,
      },
      process: {
        pos: {
          name: 'VPOS POS Module',
          enabled: true,
          required: false,
          autoRestart: false,
          allowedToStop: true,
          startupOrder: 0,
          debug: false,
          debugPort: 9229,
          config: {
            host: domsHost,
          },
          plugins: [
            {
              name: 'fclite',
              enabled: true,
              config: {
                host: domsHost,
                appId: String(posIdRaw ?? '11'),
                posId: String(posIdRaw ?? '12'),
                // Tanzania calling code (legacy default)
                countryCode: 255,
                pollingTime: 1000,
                skipAttendantAuth: false,
                fpIds: Array.isArray(oldConfig?.doms?.fpIds)
                  ? oldConfig.doms.fpIds
                  : [],
                autoClearAllErrors: false,
                autoClearErrors: ['Pump totals mismatch'],
                skipFiscalAuth: false,
                eptId: eptIdRaw != null ? String(eptIdRaw) : undefined,
              },
            },
          ],
        },
        fiscal: {
          name: 'VPOS Fiscal Module',
          enabled: true,
          required: true,
          autoRestart: true,
          allowedToStop: false,
          startupOrder: 1,
          debug: false,
          debugPort: 9229,
          config: {},
          plugins: [
            {
              name: 'tz',
              enabled: true,
              config: {
                interimReport: null,
                fuelTaxCode: 'E',
                grades: Array.isArray(oldConfig?.doms?.grades)
                  ? oldConfig.doms.grades
                  : ['Diesel', 'Unleaded', 'Kerosene'],
                printers: Array.isArray(oldConfig?.printers)
                  ? oldConfig.printers.map((p: any) => ({
                      ...p,
                      stationDetails: p?.stationDetails ?? {
                        name: 'Station',
                        contactName: 'Contact',
                        contactNumber: 'N/A',
                        contactEmail: 'N/A',
                      },
                    }))
                  : [],
              },
            },
          ],
        },
        api: {
          name: 'VPOS API Module',
          enabled: true,
          required: true,
          autoRestart: true,
          allowedToStop: false,
          startupOrder: 2,
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
            { name: 'supervisor', enabled: true, config: {} },
            { name: 'config', enabled: true, config: {} },
          ],
        },
      },
    },
  }

  // Validate hard to prevent importing invalid station_config payloads.
  return systemConfigSchema.parse(newConfig)
}

export function looksLikeEngineConfig(input: any): boolean {
  if (!input || typeof input !== 'object') return false
  // Heuristic: old engine config has "doms" and "printers" and does not have
  // the newer "processes.process" map.
  if (input?.processes?.process) return false
  return !!input?.doms || Array.isArray(input?.printers)
}
