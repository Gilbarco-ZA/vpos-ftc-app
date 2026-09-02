import type {
  JplCommandContext,
  JplCommandHandlerResult,
} from '@/src/platform/integrations/jpl/commands/contracts'

export type TankCommandDeps = {
  pick: (value: any, keys: string[]) => any
  toId2String: (value: unknown, fallback?: string) => string
  sendSimpleWetstockCommand: (
    client: any,
    timeoutMs: number,
    action: string,
    payload: Record<string, unknown>,
    timeoutMessage: string,
  ) => Promise<any>
  readTgStatus: (
    client: any,
    timeoutMs: number,
    tgId: string,
    preferredSubCode?: string,
  ) => Promise<any>
  readSiteDeliveryStatus: (
    client: any,
    timeoutMs: number,
    preferredSubCode?: string,
  ) => Promise<any>
  readTankDeliveryData: (
    client: any,
    timeoutMs: number,
    tgId: string,
    posId: string,
    itemIds?: string[],
  ) => Promise<any>
  clearTankDeliveryData: (
    client: any,
    timeoutMs: number,
    payload: Record<string, unknown>,
  ) => Promise<any>
}

const ID_ZERO = '00'

export async function handleTankCommand(
  context: JplCommandContext,
  deps: TankCommandDeps,
): Promise<JplCommandHandlerResult> {
  const { client, cmd, posId, runtime, timeoutMs } = context
  const payload = ((cmd as any).payload ?? {}) as Record<string, unknown>

  if (
    cmd.type === 'OPEN_TANK_CONTROLLER' ||
    cmd.type === 'CLOSE_TANK_CONTROLLER' ||
    cmd.type === 'START_DELIVERY_PROCESS' ||
    cmd.type === 'STOP_DELIVERY_PROCESS'
  ) {
    const tankId = deps.toId2String(
      deps.pick(
        payload,
        cmd.type === 'OPEN_TANK_CONTROLLER' ||
          cmd.type === 'CLOSE_TANK_CONTROLLER'
          ? ['tankId', 'TankId', 'tgId', 'TgId']
          : ['tankId', 'TankId'],
      ),
      cmd.type === 'CLOSE_TANK_CONTROLLER' ? ID_ZERO : '',
    )
    if (!tankId && cmd.type !== 'CLOSE_TANK_CONTROLLER') {
      throw new Error('TankId is required')
    }

    const timeoutAction =
      cmd.type === 'OPEN_TANK_CONTROLLER'
        ? `opening tank controller ${tankId}`
        : cmd.type === 'CLOSE_TANK_CONTROLLER'
          ? `closing tank controller ${tankId}`
          : cmd.type === 'START_DELIVERY_PROCESS'
            ? `starting delivery process for tank ${tankId}`
            : `stopping delivery process for tank ${tankId}`
    const commandPayload = {
      ...payload,
      tankId,
      ...(cmd.type === 'CLOSE_TANK_CONTROLLER' ? {} : { posId }),
    }
    const result = await deps.sendSimpleWetstockCommand(
      client,
      timeoutMs,
      cmd.type,
      commandPayload,
      `Timed out ${timeoutAction}`,
    )
    return {
      ok: true,
      accepted: true,
      data: { tankId, response: result.response },
    }
  }

  if (cmd.type === 'GET_TG_STATUS') {
    const tgId = deps.toId2String(
      deps.pick(payload, ['tgId', 'TgId', 'tankId', 'TankId']),
      ID_ZERO,
    )
    const preferredSubCode = String(
      deps.pick(payload, ['subCode', 'SubCode']) ?? '',
    ).trim()
    const result = await deps.readTgStatus(
      client,
      timeoutMs,
      tgId,
      preferredSubCode || undefined,
    )
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'GET_TRANSACTION_BUFFER_STATUS') {
    const gatewayState = runtime.getGatewayState()
    return {
      ok: true,
      accepted: true,
      data: {
        bufferHealth: gatewayState.bufferHealth ?? null,
        bufferAlerts: gatewayState.bufferAlerts ?? [],
      },
    }
  }

  if (cmd.type === 'GET_SITE_DELIVERY_STATUS') {
    const preferredSubCode = String(
      deps.pick(payload, ['subCode', 'SubCode']) ?? '',
    ).trim()
    const result = await deps.readSiteDeliveryStatus(
      client,
      timeoutMs,
      preferredSubCode || undefined,
    )
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'GET_TANK_DELIVERY_DATA') {
    const tgId = deps.toId2String(
      deps.pick(payload, ['tgId', 'TgId', 'tankId', 'TankId']),
      '',
    )
    if (!tgId) throw new Error('TgId is required')
    const rawItemIds = deps.pick(payload, [
      'tankDeliveryDataItemId',
      'TankDeliveryDataItemId',
    ])
    const itemIds = Array.isArray(rawItemIds)
      ? rawItemIds.map((value) => deps.toId2String(value, '')).filter(Boolean)
      : undefined
    const requestPosId = deps.toId2String(
      deps.pick(payload, ['posId', 'PosId']),
      posId,
    )
    const result = await deps.readTankDeliveryData(
      client,
      timeoutMs,
      tgId,
      requestPosId,
      itemIds,
    )
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'CLEAR_TANK_DELIVERY_DATA') {
    const requestPosId = deps.toId2String(
      deps.pick(payload, ['posId', 'PosId']),
      posId,
    )
    const deliveryReportSeqNo = String(
      deps.pick(payload, ['deliveryReportSeqNo', 'DeliveryReportSeqNo']) ?? '0',
    ).trim()
    const rawTankDeliveries = deps.pick(payload, [
      'tankDeliveries',
      'TankDeliveries',
    ])
    const tankDeliveries = Array.isArray(rawTankDeliveries)
      ? rawTankDeliveries
          .map((entry) => ({
            TgId: deps.toId2String(deps.pick(entry, ['tgId', 'TgId']), ''),
            TankDeliverySeqNo: deps.toId2String(
              deps.pick(entry, ['tankDeliverySeqNo', 'TankDeliverySeqNo']),
              '',
            ),
          }))
          .filter((entry) => entry.TgId && entry.TankDeliverySeqNo)
      : []
    const result = await deps.clearTankDeliveryData(client, timeoutMs, {
      PosId: requestPosId,
      DeliveryReportSeqNo: deliveryReportSeqNo || '0',
      ...(tankDeliveries.length ? { TankDeliveries: tankDeliveries } : {}),
    })
    return { ok: true, accepted: true, data: result }
  }

  return null
}
