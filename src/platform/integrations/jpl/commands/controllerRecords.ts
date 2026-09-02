import type {
  JplCommandContext,
  JplCommandHandlerResult,
} from '@/src/platform/integrations/jpl/commands/contracts'

export type ControllerRecordCommandDeps = {
  readFcStatus: (client: any, timeoutMs: number) => Promise<any>
  readPosConnectionStatus: (client: any, timeoutMs: number) => Promise<any>
  readPssPeripheralsStatus: (client: any, timeoutMs: number) => Promise<any>
  readFcServiceMessage: (client: any, timeoutMs: number) => Promise<any>
  persistCollectedServiceMessage: (
    stationId: string,
    response: any,
  ) => Promise<unknown>
  clearFcServiceMessage: (
    client: any,
    timeoutMs: number,
    seqNo: string,
  ) => Promise<any>
  readBackOfficeRecord: (
    client: any,
    timeoutMs: number,
    preferredSubCode?: string,
  ) => Promise<any>
  persistCollectedBackOfficeRecord: (
    stationId: string,
    response: any,
    usedSubCode: string,
  ) => Promise<unknown>
  clearBackOfficeRecord: (
    client: any,
    timeoutMs: number,
    seqNo: string,
  ) => Promise<any>
}

export async function handleControllerRecordCommand(
  context: JplCommandContext,
  deps: ControllerRecordCommandDeps,
): Promise<JplCommandHandlerResult> {
  const { client, cmd, stationId, timeoutMs } = context

  if (cmd.type === 'GET_FC_STATUS') {
    const result = await deps.readFcStatus(client, timeoutMs)
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'GET_POS_CONNECTION_STATUS') {
    const result = await deps.readPosConnectionStatus(client, timeoutMs)
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'GET_PSS_PERIPHERALS_STATUS') {
    const result = await deps.readPssPeripheralsStatus(client, timeoutMs)
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'GET_FC_SERVICE_LOG') {
    const result = await deps.readFcServiceMessage(client, timeoutMs)
    await deps.persistCollectedServiceMessage(stationId, result.response)
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'CLEAR_FC_SERVICE_LOG') {
    const payload = (cmd as any).payload ?? {}
    const seqNo = String(
      payload?.fcServiceMsgSeqNo ?? payload?.FcServiceMsgSeqNo ?? '',
    ).trim()
    if (!seqNo) throw new Error('FcServiceMsgSeqNo is required')
    const result = await deps.clearFcServiceMessage(client, timeoutMs, seqNo)
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'GET_BACK_OFFICE_RECORD') {
    const payload = (cmd as any).payload ?? {}
    const preferredSubCode = String(
      payload?.subCode ?? payload?.SubCode ?? payload?.preferredSubCode ?? '',
    ).trim()
    const result = await deps.readBackOfficeRecord(
      client,
      timeoutMs,
      preferredSubCode || undefined,
    )
    await deps.persistCollectedBackOfficeRecord(
      stationId,
      result.response,
      result.usedSubCode,
    )
    return { ok: true, accepted: true, data: result }
  }

  if (cmd.type === 'CLEAR_BACK_OFFICE_RECORD') {
    const payload = (cmd as any).payload ?? {}
    const seqNo = String(payload?.borSeqNo ?? payload?.BorSeqNo ?? '').trim()
    if (!seqNo) throw new Error('BorSeqNo is required')
    const result = await deps.clearBackOfficeRecord(client, timeoutMs, seqNo)
    return { ok: true, accepted: true, data: result }
  }

  return null
}
