import type { JplClientRuntimeDeps } from '@/src/platform/integrations/jpl/commands/contracts'
import type {
  JplHealth,
  PosCommand,
  PosCommandResult,
} from '@/src/platform/integrations/jpl/types'
import type { JplAccessMode } from '@/src/shared/integrations/jplAccess'

import { handleControllerRecordCommand } from '@/src/platform/integrations/jpl/commands/controllerRecords'
import { handleDeliveryCommand } from '@/src/platform/integrations/jpl/commands/delivery'
import { handleDirectCommand } from '@/src/platform/integrations/jpl/commands/direct'
import { handleDynamicTankCommand } from '@/src/platform/integrations/jpl/commands/dynamicTank'
import { handleLifecycleCommand } from '@/src/platform/integrations/jpl/commands/lifecycle'
import { handlePricingCommand } from '@/src/platform/integrations/jpl/commands/pricing'
import { handlePumpCommand } from '@/src/platform/integrations/jpl/commands/pump'
import { handleTankCommand } from '@/src/platform/integrations/jpl/commands/tank'
import { handleTransactionCommand } from '@/src/platform/integrations/jpl/commands/transactions'
import { getJplConfig } from '@/src/platform/integrations/jpl/config'
import {
  ensureJplGatewayStarted,
  getJplClient,
  getJplGatewayState,
} from '@/src/platform/integrations/jpl/gateway'
import {
  enqueueJplCommand,
  prepareJplCommandExecution,
} from '@/src/platform/integrations/jpl/orchestration'
import { requestWithTimeout } from '@/src/platform/integrations/jpl/protocol/runtime'
import {
  clearBackOfficeRecord,
  clearFcServiceMessage,
  clearTankDeliveryData,
  readBackOfficeRecord,
  readFcServiceMessage,
  readFcStatus,
  readFpError,
  readFpFuellingData,
  readFpInfo,
  readFpStatus,
  readPosConnectionStatus,
  readPssPeripheralsStatus,
  readSiteDeliveryStatus,
  readTankDeliveryData,
  readTgStatus,
  sendSimpleWetstockCommand,
} from '@/src/platform/integrations/jpl/protocol/statusReads'
import {
  persistCollectedBackOfficeRecord,
  persistCollectedServiceMessage,
} from '@/src/platform/integrations/jpl/specialRecordPersistence'
import { assertJplAccessAllowed } from '@/src/shared/integrations/jplAccess'

import { getReplayStatusSummary } from '@/src/modules/forecourt/infrastructure/jpl/transactionService'

async function assertJplAccessAllowedForMode(
  stationId: string,
  accessMode: JplAccessMode = 'pos',
) {
  await assertJplAccessAllowed(stationId, accessMode)
}
const ID_ZERO = '00'

export type { JplClientRuntimeDeps } from '@/src/platform/integrations/jpl/commands/contracts'

const DEFAULT_JPL_CLIENT_RUNTIME_DEPS: JplClientRuntimeDeps = {
  assertAccessAllowed: assertJplAccessAllowedForMode,
  getGatewayState: getJplGatewayState,
  ensureGatewayStarted: ensureJplGatewayStarted,
  getClient: getJplClient,
  getConfig: getJplConfig,
  getReplayStatus: getReplayStatusSummary,
}

const resolveJplClientRuntimeDeps = (
  overrides?: Partial<JplClientRuntimeDeps>,
): JplClientRuntimeDeps => ({
  ...DEFAULT_JPL_CLIENT_RUNTIME_DEPS,
  ...overrides,
})

const toId2 = (value: number) => {
  const n = Number.isFinite(value) ? Math.trunc(value) : 0
  return String(Math.max(0, n)).padStart(2, '0')
}

const toInt = (value: unknown, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

const toId2String = (value: unknown, fallback = ID_ZERO) => {
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim().padStart(2, '0')
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return String(Math.max(0, Math.trunc(parsed))).padStart(2, '0')
}

const pick = (value: any, keys: string[]) => {
  for (const key of keys) {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key]
    }
  }
  return undefined
}

function resolvePumpNozzle(payload: Record<string, unknown>) {
  const pumpId = toInt(
    payload.pumpNumber ?? payload.pumpId ?? payload.fpId ?? payload.FpId,
    1,
  )
  const nozzleId = toInt(
    payload.nozzleNumber ??
      payload.nozzleId ??
      payload.nozzle ??
      payload.NozzleNumber,
    1,
  )
  return { pumpId, nozzleId }
}

export async function jplHealth(
  stationId: string,
  options: { accessMode?: JplAccessMode } = {},
  dependencyOverrides?: Partial<JplClientRuntimeDeps>,
): Promise<JplHealth> {
  const runtime = resolveJplClientRuntimeDeps(dependencyOverrides)
  await runtime.assertAccessAllowed(stationId, options.accessMode ?? 'pos')
  const state: any = runtime.getGatewayState()

  return {
    ok: Boolean(state.apcs?.apc1?.connected && state.apcs?.apc1?.loggedOn),
    provider: 'JPL',
    host: String((await runtime.getConfig(stationId))?.host ?? ''),
    apcs: state.apcs,
    version: state.version,
    secureMode: state.secureMode,
    lastMessageAt: state.lastMessageAt,
    lastHeartbeatAt: state.lastHeartbeatAt,
    controllerStatus: state.controllerStatus ?? null,
    posConnectionStatus: state.posConnectionStatus ?? null,
    peripheralsStatus: state.peripheralsStatus ?? null,
    installStatus: state.installStatus ?? null,
    pumpStatuses: state.pumpStatuses ?? [],
    fpInfo: state.fpInfo ?? [],
    fuellingData: state.fuellingData ?? [],
    tankStatuses: state.tankStatuses ?? [],
    siteDeliveryStatus: state.siteDeliveryStatus ?? null,
    tankDeliveryData: state.tankDeliveryData ?? [],
    fpErrors: state.fpErrors ?? [],
    serviceMessages: state.serviceMessages ?? [],
    backOfficeRecords: state.backOfficeRecords ?? [],
    activePumpStatuses: state.activePumpStatuses ?? [],
    tankAlerts: state.tankAlerts ?? [],
    controllerFlags: state.controllerFlags ?? {},
    onlinePeerConnections: state.onlinePeerConnections ?? [],
    peripheralAlerts: state.peripheralAlerts ?? [],
    pumpErrorDiagnostics: state.pumpErrorDiagnostics ?? [],
    replayCapabilities: state.replayCapabilities ?? undefined,
    error: state.apcs?.apc1?.connected ? undefined : 'JPL gateway not started',
  }
}

/**
 * Minimal TCP command support.
 *
 * Notes:
 * - This intentionally supports only a small set of commands to prove the end-to-end
 *   communication path (machine <-> application).
 * - For a richer command surface, add command-specific request builders and
 *   correlation logic (sequence/message IDs) where applicable.
 */
export async function jplSendPosCommand(
  stationId: string,
  cmd: PosCommand,
  options: { accessMode?: JplAccessMode } = {},
  dependencyOverrides?: Partial<JplClientRuntimeDeps>,
): Promise<PosCommandResult> {
  const runtime = resolveJplClientRuntimeDeps(dependencyOverrides)
  await runtime.assertAccessAllowed(stationId, options.accessMode ?? 'pos')

  const prepared = await prepareJplCommandExecution(runtime)
  if (!prepared.ok) return prepared.result
  const { client } = prepared

  const cfg = await runtime.getConfig(stationId)
  const timeoutMs = Number(
    cfg?.timeoutMs ?? process.env.JPL_TIMEOUT_MS ?? 10_000,
  )
  const posId = toId2(Number(cfg?.posId ?? process.env.JPL_POS_ID ?? 1))
  const fpOperationModeNo = Number(
    cfg?.fpOperationModeNo ?? process.env.JPL_FP_OPERATION_MODE_NO ?? 1,
  )

  const enqueueCommand = runtime.enqueueCommand ?? enqueueJplCommand

  return await enqueueCommand(async () => {
    try {
      const commandContext = {
        stationId,
        cmd,
        client,
        timeoutMs,
        posId,
        fpOperationModeNo,
        runtime,
      }

      const lifecycleResult = await handleLifecycleCommand(commandContext)
      if (lifecycleResult) return lifecycleResult

      const controllerRecordResult = await handleControllerRecordCommand(
        commandContext,
        {
          readFcStatus,
          readPosConnectionStatus,
          readPssPeripheralsStatus,
          readFcServiceMessage,
          persistCollectedServiceMessage,
          clearFcServiceMessage,
          readBackOfficeRecord,
          persistCollectedBackOfficeRecord,
          clearBackOfficeRecord,
        },
      )
      if (controllerRecordResult) return controllerRecordResult

      const pumpResult = await handlePumpCommand(commandContext, {
        pick,
        toId2,
        toId2String,
        toInt,
        resolvePumpNozzle,
        requestWithTimeout,
        readFpStatus,
        readFpInfo,
        readFpFuellingData,
        readFpError,
      })
      if (pumpResult) return pumpResult

      const tankResult = await handleTankCommand(commandContext, {
        pick,
        toId2String,
        sendSimpleWetstockCommand,
        readTgStatus,
        readSiteDeliveryStatus,
        readTankDeliveryData,
        clearTankDeliveryData,
      })
      if (tankResult) return tankResult

      const transactionResult = await handleTransactionCommand(commandContext, {
        pick,
        toId2,
        resolvePumpNozzle,
        requestWithTimeout,
      })
      if (transactionResult) return transactionResult

      const dynamicTankResult = await handleDynamicTankCommand(commandContext)
      if (dynamicTankResult) return dynamicTankResult

      const pricingResult = await handlePricingCommand(commandContext)
      if (pricingResult) return pricingResult

      const deliveryResult = await handleDeliveryCommand(commandContext)
      if (deliveryResult) return deliveryResult

      const directResult = await handleDirectCommand(commandContext, {
        pick,
        requestWithTimeout,
      })
      if (directResult) return directResult

      return {
        ok: false,
        accepted: false,
        error: `Unsupported JPL command type: ${String(cmd.type)}`,
      }
    } catch (e: any) {
      return { ok: false, accepted: false, error: e?.message ?? String(e) }
    }
  })
}
