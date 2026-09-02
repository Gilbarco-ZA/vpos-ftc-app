import type {
  JplCommandContext,
  JplCommandHandlerResult,
} from '@/src/platform/integrations/jpl/commands/contracts'

import {
  buildClearSupervisedTransactionRequest,
  buildClearUnsupervisedTransactionRequest,
  buildReadSupervisedTransactionRequest,
  buildReadUnsupervisedTransactionRequest,
  buildUnlockSupervisedTransactionRequest,
  buildUnlockUnsupervisedTransactionRequest,
  extractExtendedClearFields,
  extractTransactionCore,
  resolveTransactionParIds,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionService'

export type TransactionCommandDeps = {
  pick: (value: any, keys: string[]) => any
  toId2: (value: number) => string
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
}

const ID_ZERO = '00'

const hasExtendedSupervisedClearData = (value: any) => {
  const fields = extractExtendedClearFields(value)
  return Boolean(fields.Vol_e && fields.Money_e)
}

const resolveSupervisedClearTransaction = async (args: {
  client: any
  deps: TransactionCommandDeps
  fpId: unknown
  posId: unknown
  transSeqNo: unknown
  payload: Record<string, unknown>
  txData?: any
  timeoutMs: number
}) => {
  if (hasExtendedSupervisedClearData(args.txData)) return args.txData
  if (hasExtendedSupervisedClearData(args.payload)) return args.payload

  const readRequest = buildReadSupervisedTransactionRequest({
    fpId: args.fpId,
    posId: args.posId,
    transSeqNo: args.transSeqNo,
    transParId: resolveTransactionParIds(args.payload),
  })

  return await args.deps.requestWithTimeout(
    args.client,
    readRequest,
    args.timeoutMs,
    'Timed out reading supervised transaction before clear',
  )
}

export async function handleTransactionCommand(
  context: JplCommandContext,
  deps: TransactionCommandDeps,
): Promise<JplCommandHandlerResult> {
  const { client, cmd, posId, timeoutMs } = context
  const payload = ((cmd as any).payload ?? {}) as Record<string, unknown>

  if (
    cmd.type === 'GET_SUPERVISED_TRANSACTION' ||
    cmd.type === 'GET_UNSUPERVISED_TRANSACTION'
  ) {
    const { pumpId } = deps.resolvePumpNozzle(payload)
    const requestInput = {
      fpId: pumpId,
      posId: deps.pick(payload, ['posId', 'PosId']) ?? ID_ZERO,
      transSeqNo: deps.pick(payload, ['transSeqNo', 'TransSeqNo']),
      transParId: resolveTransactionParIds(payload),
    }
    const request =
      cmd.type === 'GET_SUPERVISED_TRANSACTION'
        ? buildReadSupervisedTransactionRequest(requestInput)
        : buildReadUnsupervisedTransactionRequest(requestInput)
    const response = await deps.requestWithTimeout(
      client,
      request,
      timeoutMs,
      cmd.type === 'GET_SUPERVISED_TRANSACTION'
        ? 'Timed out reading supervised transaction'
        : 'Timed out reading unsupervised transaction',
    )
    const core = extractTransactionCore(response)
    return {
      ok: true,
      accepted: true,
      data: { response, fpId: core.fpId, transSeqNo: core.transSeqNo },
    }
  }

  if (
    cmd.type === 'UNLOCK_SUPERVISED_TRANSACTION' ||
    cmd.type === 'UNLOCK_UNSUPERVISED_TRANSACTION'
  ) {
    const { pumpId } = deps.resolvePumpNozzle(payload)
    const requestInput = {
      fpId: pumpId,
      posId: deps.pick(payload, ['posId', 'PosId']) ?? posId,
      transSeqNo: deps.pick(payload, ['transSeqNo', 'TransSeqNo']),
    }
    const request =
      cmd.type === 'UNLOCK_SUPERVISED_TRANSACTION'
        ? buildUnlockSupervisedTransactionRequest(requestInput)
        : buildUnlockUnsupervisedTransactionRequest(requestInput)
    const response = await deps.requestWithTimeout(
      client,
      request,
      timeoutMs,
      cmd.type === 'UNLOCK_SUPERVISED_TRANSACTION'
        ? 'Timed out unlocking supervised transaction'
        : 'Timed out unlocking unsupervised transaction',
    )
    return { ok: true, accepted: true, data: { response } }
  }

  if (
    cmd.type === 'CLEAR_SUPERVISED_TRANSACTION' ||
    cmd.type === 'CLEAR_UNSUPERVISED_TRANSACTION'
  ) {
    const txData = deps.pick(payload, ['transaction', 'txData', 'response'])
    const core = extractTransactionCore(txData ?? payload)
    const { pumpId } = deps.resolvePumpNozzle({
      ...payload,
      pumpNumber: Number(
        core.fpId ?? deps.pick(payload, ['pumpNumber', 'fpId', 'FpId']) ?? 0,
      ),
    })
    const clearPosId = deps.pick(payload, ['posId', 'PosId']) ?? posId
    const clearTransSeqNo =
      core.transSeqNo ?? deps.pick(payload, ['transSeqNo', 'TransSeqNo'])
    const clearTxData =
      cmd.type === 'CLEAR_SUPERVISED_TRANSACTION'
        ? await resolveSupervisedClearTransaction({
            client,
            deps,
            fpId: core.fpId ?? pumpId,
            posId: clearPosId,
            transSeqNo: clearTransSeqNo,
            payload,
            txData,
            timeoutMs,
          })
        : txData
    const requestInput = {
      fpId: core.fpId ?? pumpId,
      posId: clearPosId,
      transSeqNo: clearTransSeqNo,
      txData: clearTxData,
      payload,
    }
    const request =
      cmd.type === 'CLEAR_SUPERVISED_TRANSACTION'
        ? buildClearSupervisedTransactionRequest(requestInput)
        : buildClearUnsupervisedTransactionRequest(requestInput)
    const response = await deps.requestWithTimeout(
      client,
      request,
      timeoutMs,
      cmd.type === 'CLEAR_SUPERVISED_TRANSACTION'
        ? 'Timed out clearing supervised transaction'
        : 'Timed out clearing unsupervised transaction',
    )
    return {
      ok: true,
      accepted: true,
      data: {
        response,
        fpId: core.fpId ?? deps.toId2(pumpId),
        transSeqNo:
          core.transSeqNo ??
          String(deps.pick(payload, ['transSeqNo', 'TransSeqNo']) ?? '')
            .trim()
            .padStart(4, '0'),
      },
    }
  }

  if (cmd.type === 'COMPLETE_TRANSACTION') {
    const txData = deps.pick(payload, ['transaction', 'txData', 'response'])
    const core = extractTransactionCore(txData ?? payload)
    const { pumpId } = deps.resolvePumpNozzle({
      ...payload,
      pumpNumber: Number(
        core.fpId ?? deps.pick(payload, ['pumpNumber', 'fpId', 'FpId']) ?? 0,
      ),
    })
    const transSeqNo =
      core.transSeqNo ??
      String(deps.pick(payload, ['transSeqNo', 'TransSeqNo']) ?? '').trim()
    if (!transSeqNo) {
      throw new Error(
        'COMPLETE_TRANSACTION requires TransSeqNo for clear_FpSupTrans_req',
      )
    }

    const clearPosId = deps.pick(payload, ['posId', 'PosId']) ?? posId
    const clearTxData = await resolveSupervisedClearTransaction({
      client,
      deps,
      fpId: core.fpId ?? pumpId,
      posId: clearPosId,
      transSeqNo,
      payload,
      txData,
      timeoutMs,
    })
    const request = buildClearSupervisedTransactionRequest({
      fpId: core.fpId ?? pumpId,
      posId: clearPosId,
      transSeqNo,
      txData: clearTxData,
      payload,
    })
    await deps.requestWithTimeout(
      client,
      request,
      timeoutMs,
      'Timed out sending clear transaction command',
    )
    return {
      ok: true,
      accepted: true,
      data: {
        pumpId,
        transSeqNo: String(transSeqNo).padStart(4, '0'),
        clearVariant: request.subCode,
      },
    }
  }

  return null
}
