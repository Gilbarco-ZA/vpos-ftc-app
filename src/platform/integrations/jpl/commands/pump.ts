import type {
  JplCommandContext,
  JplCommandHandlerResult,
} from '@/src/platform/integrations/jpl/commands/contracts'

import {
  buildJplCommandRequest,
  describeJplAuthorizeRequest,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/commands'

export type PumpCommandDeps = {
  pick: (value: any, keys: string[]) => any
  toId2: (value: number) => string
  toId2String: (value: unknown, fallback?: string) => string
  toInt: (value: unknown, fallback: number) => number
  resolvePumpNozzle: (payload: Record<string, unknown>) => {
    pumpId: number
    nozzleId: number | null
  }
  requestWithTimeout: (
    client: any,
    message: any,
    timeoutMs: number,
    timeoutMessage: string,
  ) => Promise<any>
  readFpStatus: (
    client: any,
    timeoutMs: number,
    fpId: string,
    preferredSubCode?: string,
  ) => Promise<any>
  readFpInfo: (
    client: any,
    timeoutMs: number,
    fpId: string,
    fpInfoParId?: string[],
  ) => Promise<any>
  readFpFuellingData: (
    client: any,
    timeoutMs: number,
    fpId: string,
    preferredSubCode?: string,
  ) => Promise<any>
  readFpError: (client: any, timeoutMs: number, fpId: string) => Promise<any>
}

const ID_ZERO = '00'

export async function handlePumpCommand(
  context: JplCommandContext,
  deps: PumpCommandDeps,
): Promise<JplCommandHandlerResult> {
  const { client, cmd, fpOperationModeNo, posId, timeoutMs } = context
  const payload = ((cmd as any).payload ?? {}) as Record<string, unknown>

  if (cmd.type === 'GET_FP_STATUS') {
    const fpId = deps.toId2String(
      deps.pick(payload, ['fpId', 'FpId', 'pumpId', 'pumpNumber']),
      ID_ZERO,
    )
    const preferredSubCode = String(
      deps.pick(payload, ['subCode', 'SubCode']) ?? '',
    ).trim()
    const result = await deps.readFpStatus(
      client,
      timeoutMs,
      fpId,
      preferredSubCode || undefined,
    )
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'GET_FP_INFO') {
    const fpId = deps.toId2String(
      deps.pick(payload, ['fpId', 'FpId', 'pumpId', 'pumpNumber']),
      ID_ZERO,
    )
    const rawParIds = deps.pick(payload, ['fpInfoParId', 'FpInfoParId'])
    const fpInfoParId = Array.isArray(rawParIds)
      ? rawParIds.map((value) => deps.toId2String(value, '')).filter(Boolean)
      : undefined
    const result = await deps.readFpInfo(client, timeoutMs, fpId, fpInfoParId)
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'GET_FP_FUELLING_DATA') {
    const fpId = deps.toId2String(
      deps.pick(payload, ['fpId', 'FpId', 'pumpId', 'pumpNumber']),
      ID_ZERO,
    )
    const preferredSubCode = String(
      deps.pick(payload, ['subCode', 'SubCode']) ?? '',
    ).trim()
    const result = await deps.readFpFuellingData(
      client,
      timeoutMs,
      fpId,
      preferredSubCode || undefined,
    )
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'GET_FP_ERROR') {
    const fpId = deps.toId2String(
      deps.pick(payload, ['fpId', 'FpId', 'pumpId', 'pumpNumber']),
      ID_ZERO,
    )
    const result = await deps.readFpError(client, timeoutMs, fpId)
    return { ok: true, accepted: true, data: result }
  }

  if (
    cmd.type === 'PRESET_FUEL_AUTH' ||
    cmd.type === 'EXTENDED_FUEL_AUTH' ||
    cmd.type === 'PREPARE_TRANSACTION'
  ) {
    const { pumpId, nozzleId } = deps.resolvePumpNozzle(payload)
    const request = buildJplCommandRequest(cmd.type, {
      ...payload,
      pumpNumber: pumpId,
      posId,
    })
    if (!request) {
      const label =
        cmd.type === 'PRESET_FUEL_AUTH'
          ? 'preset authorize'
          : cmd.type === 'EXTENDED_FUEL_AUTH'
            ? 'extended authorize'
            : 'prepare transaction'
      throw new Error(`Unable to build ${label} request`)
    }
    const timeoutMessage =
      cmd.type === 'PRESET_FUEL_AUTH'
        ? 'Timed out sending preset authorize command'
        : cmd.type === 'EXTENDED_FUEL_AUTH'
          ? 'Timed out sending extended authorize command'
          : 'Timed out sending prepare transaction command'
    const response = await deps.requestWithTimeout(
      client,
      request,
      timeoutMs,
      timeoutMessage,
    )
    return {
      ok: true,
      accepted: true,
      data: {
        pumpId,
        nozzleId,
        response,
        ...describeJplAuthorizeRequest(cmd.type, payload),
      },
    }
  }

  if (cmd.type === 'OPEN_FPS') {
    const { pumpId, nozzleId } = deps.resolvePumpNozzle(payload)
    await deps.requestWithTimeout(
      client,
      {
        name: 'open_Fp_req',
        subCode: '00H',
        data: {
          FpId: deps.toId2(pumpId),
          PosId: posId,
          FpOperationModeNo: deps.toInt(
            deps.pick(payload, ['fpOperationModeNo', 'FpOperationModeNo']),
            fpOperationModeNo,
          ),
        },
      },
      timeoutMs,
      'Timed out sending open command',
    )
    return { ok: true, accepted: true, data: { pumpId, nozzleId } }
  }

  if (cmd.type === 'ATTENDANT_AUTH' || cmd.type === 'PREFUEL_CUSTOMER') {
    const { pumpId, nozzleId } = deps.resolvePumpNozzle(payload)
    await deps.requestWithTimeout(
      client,
      {
        name: 'authorize_Fp_req',
        subCode: '00H',
        data: { FpId: deps.toId2(pumpId), PosId: posId },
      },
      timeoutMs,
      'Timed out sending authorize command',
    )
    return {
      ok: true,
      accepted: true,
      data: {
        pumpId,
        nozzleId,
        ...describeJplAuthorizeRequest('AUTHORIZE_FP', payload),
      },
    }
  }

  if (cmd.type === 'CLOSE_FPS') {
    const { pumpId } = deps.resolvePumpNozzle(payload)
    await deps.requestWithTimeout(
      client,
      {
        name: 'close_Fp_req',
        subCode: '00H',
        data: { FpId: deps.toId2(pumpId), PosId: posId },
      },
      timeoutMs,
      'Timed out sending close command',
    )
    return { ok: true, accepted: true, data: { pumpId } }
  }

  if (
    cmd.type === 'CLEAR_PREFUEL_CUSTOMER' ||
    cmd.type === 'CANCEL_TRANSACTION'
  ) {
    const { pumpId } = deps.resolvePumpNozzle(payload)
    await deps.requestWithTimeout(
      client,
      {
        name: 'cancel_FpAuth_req',
        subCode: '00H',
        data: { FpId: deps.toId2(pumpId), PosId: posId },
      },
      timeoutMs,
      'Timed out sending cancel auth command',
    )
    return { ok: true, accepted: true, data: { pumpId } }
  }

  if (cmd.type === 'ESTOP_FP' || cmd.type === 'CANCEL_FP_ESTOP') {
    const { pumpId } = deps.resolvePumpNozzle(payload)
    await deps.requestWithTimeout(
      client,
      {
        name: cmd.type === 'ESTOP_FP' ? 'estop_Fp_req' : 'cancel_FpEstop_req',
        subCode: '00H',
        data: {
          FpId: deps.toId2(pumpId),
          PosId: deps.toId2String(
            deps.pick(payload, ['posId', 'PosId']),
            posId,
          ),
        },
      },
      timeoutMs,
      cmd.type === 'ESTOP_FP'
        ? 'Timed out sending estop command'
        : 'Timed out sending cancel estop command',
    )
    return { ok: true, accepted: true, data: { pumpId } }
  }

  if (cmd.type === 'RESET_FP') {
    const { pumpId } = deps.resolvePumpNozzle(payload)
    await deps.requestWithTimeout(
      client,
      {
        name: 'reset_Fp_req',
        subCode: '00H',
        data: { FpId: deps.toId2(pumpId) },
      },
      timeoutMs,
      'Timed out sending reset pump command',
    )
    return { ok: true, accepted: true, data: { pumpId } }
  }

  if (cmd.type === 'CLEAR_FP_ERROR') {
    const { pumpId } = deps.resolvePumpNozzle(payload)
    await deps.requestWithTimeout(
      client,
      {
        name: 'clear_FpError_req',
        subCode: '00H',
        data: {
          FpId: deps.toId2(pumpId),
          FpErrorCode: String(
            deps.pick(payload, ['fpErrorCode', 'FpErrorCode']) ?? '00',
          ).padStart(2, '0'),
        },
      },
      timeoutMs,
      'Timed out sending clear error command',
    )
    return { ok: true, accepted: true, data: { pumpId } }
  }

  return null
}
