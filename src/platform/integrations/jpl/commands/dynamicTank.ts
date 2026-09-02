import type {
  JplCommandContext,
  JplCommandHandlerResult,
} from '@/src/platform/integrations/jpl/commands/contracts'

import {
  getProtocolErrorText,
  requestWithSubCodeFallback,
  requestWithTimeout,
} from '@/src/platform/integrations/jpl/protocol/runtime'
import { rememberGatewaySnapshot } from '@/src/platform/integrations/jpl/protocol/snapshots'

import {
  normalizeTgDataPayload,
  resolveConfiguredTankGaugeIds,
  resolveStationTimeZone,
} from '@/src/modules/forecourt/application/tankGauge'
import { normalizeDomsDynamicTankDataRequest } from '@/src/modules/forecourt/infrastructure/jpl/dynamicTankData'

const ID_ZERO = '00'
const ALL_TANK_DATA_ITEM_IDS = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '41',
  '42',
  '43',
  '44',
]

export type DynamicTankCommandDeps = {
  resolveConfiguredTankGaugeIds?: (stationId: string) => Promise<string[]>
  resolveStationTimeZone?: (stationId: string) => Promise<string>
  requestWithTimeout?: (
    client: any,
    message: any,
    timeoutMs: number,
    timeoutMessage: string,
  ) => Promise<any>
  requestWithSubCodeFallback?: (
    client: any,
    options: {
      name: string
      variants: Array<{
        name?: string
        subCode: string
        data: Record<string, unknown>
      }>
      timeoutMs: number
      timeoutMessage: string
    },
  ) => Promise<any>
  rememberGatewaySnapshot?: (
    kind: string,
    response: any,
    usedSubCode?: string,
  ) => any
  normalizeTgDataPayload?: (
    payload: unknown,
    options?: { timeZone?: string | null },
  ) => any
  normalizeDomsDynamicTankDataRequest?: (payload: any) => any
  getProtocolErrorText?: (error: any) => string
}

const toId2 = (value: number) => {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 0
  return String(Math.max(0, normalized)).padStart(2, '0')
}

const toInt = (value: unknown, fallback: number) => {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? Math.trunc(normalized) : fallback
}

export async function handleDynamicTankCommand(
  context: JplCommandContext,
  dependencyOverrides: DynamicTankCommandDeps = {},
): Promise<JplCommandHandlerResult> {
  const { client, cmd, timeoutMs } = context
  const deps = {
    resolveConfiguredTankGaugeIds:
      dependencyOverrides.resolveConfiguredTankGaugeIds ??
      resolveConfiguredTankGaugeIds,
    resolveStationTimeZone:
      dependencyOverrides.resolveStationTimeZone ?? resolveStationTimeZone,
    requestWithTimeout:
      dependencyOverrides.requestWithTimeout ?? requestWithTimeout,
    requestWithSubCodeFallback:
      dependencyOverrides.requestWithSubCodeFallback ??
      requestWithSubCodeFallback,
    rememberGatewaySnapshot:
      dependencyOverrides.rememberGatewaySnapshot ?? rememberGatewaySnapshot,
    normalizeTgDataPayload:
      dependencyOverrides.normalizeTgDataPayload ?? normalizeTgDataPayload,
    normalizeDomsDynamicTankDataRequest:
      dependencyOverrides.normalizeDomsDynamicTankDataRequest ??
      normalizeDomsDynamicTankDataRequest,
    getProtocolErrorText:
      dependencyOverrides.getProtocolErrorText ?? getProtocolErrorText,
  }

  if (cmd.type === 'GET_ALL_TG_DATA') {
    const payload = (cmd as any).payload ?? {}
    const stationId = String(payload.stationId ?? '').trim()
    const tgIds = await deps.resolveConfiguredTankGaugeIds(stationId)

    if (!tgIds.length) {
      throw new Error(
        'No configured DOMS tank ids found. Set domsTankId (or numeric tank code) for each tank in tank settings.',
      )
    }

    const stationTimeZone = await deps.resolveStationTimeZone(stationId)

    const responses: Array<{ tgId: string; response: any }> = []
    const normalized: any[] = []
    const errors: Array<{ tgId: string; error: string }> = []

    for (const tgId of tgIds) {
      try {
        const response = await deps.requestWithTimeout(
          client,
          {
            name: 'TgData_req',
            subCode: '00H',
            data: { TgId: tgId, TankDataItemId: ALL_TANK_DATA_ITEM_IDS },
          },
          timeoutMs,
          `Timed out requesting tank gauge data for tank ${tgId}`,
        )
        responses.push({ tgId, response })
        deps.rememberGatewaySnapshot('TgData_resp', response, '00H')
        const parsed = deps.normalizeTgDataPayload(response, {
          timeZone: stationTimeZone,
        })
        if (parsed) normalized.push(parsed)
      } catch (error) {
        errors.push({ tgId, error: deps.getProtocolErrorText(error) })
      }
    }

    if (!responses.length) {
      throw new Error(errors[0]?.error ?? 'Failed to request tank gauge data')
    }

    let tankStatusSnapshot: any = null
    if (payload.includeStatusSnapshot === true) {
      try {
        const statusResult = await deps.requestWithSubCodeFallback(client, {
          name: 'TgStatus_req',
          variants: [
            { subCode: '02H', data: { TgId: ID_ZERO } },
            { subCode: '01H', data: { TgId: ID_ZERO } },
            { subCode: '00H', data: { TgId: ID_ZERO } },
          ],
          timeoutMs,
          timeoutMessage: 'Timed out requesting tank status snapshot',
        })
        tankStatusSnapshot = {
          response: statusResult.response,
          usedSubCode: statusResult.usedSubCode,
        }
        deps.rememberGatewaySnapshot(
          'TgStatus_resp',
          statusResult.response,
          statusResult.usedSubCode,
        )
      } catch (error) {
        tankStatusSnapshot = { error: deps.getProtocolErrorText(error) }
      }
    }

    return {
      ok: true,
      accepted: true,
      data: {
        requestedTgIds: tgIds,
        stationTimeZone,
        responses,
        normalized,
        errors,
        tankStatusSnapshot,
      },
    }
  }

  if (cmd.type === 'CHANGE_DYNAMIC_TANK_DATA') {
    const payload = (cmd as any).payload ?? {}
    const normalized = deps.normalizeDomsDynamicTankDataRequest(payload)
    const response = await deps.requestWithTimeout(
      client,
      {
        name: 'change_DynamicTankData_req',
        subCode: '00H',
        data: {
          TankId: normalized.tankId,
          DtdPars: normalized.dtdPars,
        },
      },
      timeoutMs,
      'Timed out updating dynamic tank data',
    )
    return { ok: true, accepted: true, data: response }
  }

  if (cmd.type === 'GET_TG_ERROR_MSG') {
    const payload = (cmd as any).payload ?? {}
    const tankId = toId2(
      toInt(
        payload.TgId ?? payload.tgId ?? payload.tankId ?? payload.TankId,
        0,
      ),
    )
    const response = await deps.requestWithTimeout(
      client,
      {
        name: 'TgErrorMsg_req',
        subCode: '00H',
        data: { TgId: tankId },
      },
      timeoutMs,
      'Timed out requesting tank gauge error',
    )
    return { ok: true, accepted: true, data: response }
  }

  return null
}
