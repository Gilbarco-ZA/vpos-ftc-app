import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getForecourtSettings } from '@/src/modules/forecourt/application/forecourtSettings'
import { extractNozzleNumber } from '@/src/modules/forecourt/infrastructure/adapters/jplTcpAdapter.helpers'

import { getStationDecimalSettingsCached } from '../infrastructure/decimalSettingsCache'
import { ingestJplSupervisedTransaction } from '../infrastructure/jpl/ingestFromForecourt'
import { getJplPumpMappings } from '../infrastructure/jpl/pumpMappings'
import {
  resolveDomsFinishDateTime,
  resolveDomsTransactionIdentity,
} from '../infrastructure/jpl/transactionIdentity'
import { resolveReplayNozzleMapping } from '../infrastructure/jpl/transactionReplayPolicy'
import { recordForecourtEvent } from '../infrastructure/persistence'
import { forecourtJplReplayRepo } from '../infrastructure/repositories/forecourtJplReplayRepo'
import {
  resolveTransactionAmount,
  resolveTransactionVolume,
} from '../infrastructure/transactionValues'

export type RestoreDomsReplayTransactionInput = {
  fpId?: unknown
  transSeqNo?: unknown
  confirmRestore?: unknown
  reason?: unknown
}

const parsePositiveInteger = (value: unknown, field: string) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative integer`)
  }
  return parsed
}

const optionalReason = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (text.length > 500)
    throw new Error('reason must be 500 characters or less')
  return text || null
}

const rawValue = (payload: any, ...keys: string[]) => {
  const transPars = payload?.TransPars ?? payload?.transPars ?? {}
  for (const key of keys) {
    const value = payload?.[key] ?? transPars?.[key]
    if (value != null && String(value).trim() !== '') return value
  }
  return null
}

export async function restoreDomsReplayTransaction(
  input: RestoreDomsReplayTransactionInput,
  user: SessionUser,
) {
  const stationId = requireNonEmptyString(user.stationId, 'stationId')
  const fpId = parsePositiveInteger(input?.fpId, 'fpId')
  const transSeqNo = parsePositiveInteger(input?.transSeqNo, 'transSeqNo')
  if (
    String(input?.confirmRestore ?? '')
      .trim()
      .toUpperCase() !== 'RESTORE'
  ) {
    throw new Error('confirmRestore must be RESTORE')
  }

  const reason = optionalReason(input?.reason)
  const replayRow = await forecourtJplReplayRepo.getByKey({
    stationId,
    fpId,
    transSeqNo,
  })
  if (!replayRow) throw new Error('Replay transaction was not found')
  if (!['read_locked', 'captured'].includes(replayRow.replay_stage)) {
    throw new Error(
      `Replay transaction cannot be restored from stage '${replayRow.replay_stage}'`,
    )
  }

  const readPayload = replayRow.read_payload_json
  if (!readPayload || typeof readPayload !== 'object') {
    throw new Error(
      'Replay row has no durable read payload and cannot be restored safely.',
    )
  }

  const [settings, decimals, mappings] = await Promise.all([
    getForecourtSettings(stationId),
    getStationDecimalSettingsCached(stationId),
    getJplPumpMappings(stationId),
  ])
  const mapping = mappings.get(fpId)
  const pumpNumber = mapping?.pumpNumber ?? fpId
  const nozzleNumber = extractNozzleNumber(readPayload)
  const nozzle = resolveReplayNozzleMapping({
    mapping,
    nozzleNumber,
    gradeId: rawValue(readPayload, 'FcGradeId'),
    gradeOptionId: rawValue(readPayload, 'FpGradeOptionNo'),
  })
  if (!nozzle) {
    throw new Error(
      'Replay transaction does not resolve to one configured nozzle; restore is unsafe.',
    )
  }

  const valuePayload = {
    raw: {
      ...readPayload,
      MoneyDue: rawValue(readPayload, 'Money_e', 'Money', 'MoneyDue'),
      Vol: rawValue(readPayload, 'Vol_e', 'Vol', 'Volume'),
    },
  }
  const amount = resolveTransactionAmount(
    valuePayload,
    settings.jplCountryCode,
    decimals.money,
  )
  const volume = resolveTransactionVolume(
    valuePayload,
    settings.jplCountryCode,
    decimals.volume,
  )

  const transactionIdentity = await resolveDomsTransactionIdentity({
    stationId,
    sourceMode: 'supervised',
    fpId,
    transSeqNo,
    transaction: readPayload,
  })
  const existing = await forecourtJplReplayRepo.findTransactionByIdentity({
    stationId,
    transactionIdentity,
  })
  if (existing) {
    return {
      restored: false,
      alreadyCaptured: true,
      transactionId: existing.id,
      transactionStatus: existing.status,
      deletedAt: existing.deleted_at,
      fpId,
      transSeqNo,
      sendsDomsCommand: false,
      message:
        'This physical DOMS transaction incarnation is already captured. No duplicate row was created.',
    }
  }

  const transactionId = await ingestJplSupervisedTransaction({
    stationId,
    sourceMode: 'supervised',
    pumpNumber,
    domsFpId: fpId,
    transSeqNo,
    lockId: replayRow.lock_id,
    nozzleId: nozzle?.nozzleId ?? null,
    nozzleNumber: nozzle?.nozzleNumber ?? nozzleNumber ?? null,
    fuelType: nozzle?.fuelType ?? null,
    amount,
    volume,
    occurredAt: resolveDomsFinishDateTime(readPayload),
    transactionIdentity,
  })
  if (!transactionId) {
    throw new Error('Transaction could not be restored to the FTC database')
  }

  const capturedAt = new Date().toISOString()
  await forecourtJplReplayRepo.markTransactionCaptured({
    stationId,
    sourceMode: 'supervised',
    fpId,
    transSeqNo,
    transLockId: replayRow.lock_id,
  })
  await forecourtJplReplayRepo.upsert({
    stationId,
    fpId,
    transSeqNo,
    replayStage: 'captured',
    capturedAt,
  })

  await createAuditLog({
    stationId,
    userId: user.id,
    action: 'DOMS_REPLAY_TRANSACTION_RESTORED',
    entityType: 'forecourt.jplReplayTransaction',
    entityId: `${fpId}:${transSeqNo}`,
    newValues: {
      transactionId,
      fpId,
      transSeqNo,
      amount,
      volume,
      restoredStatus: 'OPEN',
      reason,
    },
    metadata: {
      username: user.username,
      replayStageBefore: replayRow.replay_stage,
      sendsDomsCommand: false,
      safetyBoundary:
        'Restores the durable replay payload into the FTC transactions table only. It does not clear, unlock, or modify the DOMS/PSS transaction buffer.',
    },
  })

  await recordForecourtEvent({
    stationId,
    source: 'admin',
    eventType: 'doms.replay_transaction_restored',
    payload: {
      transactionId,
      fpId,
      transSeqNo,
      amount,
      volume,
      userId: user.id,
      username: user.username,
      reason,
      sendsDomsCommand: false,
    },
  })

  return {
    restored: true,
    alreadyCaptured: false,
    transactionId,
    transactionStatus: 'OPEN',
    fpId,
    transSeqNo,
    amount,
    volume,
    sendsDomsCommand: false,
    message:
      'The replay payload was restored to the non-fiscalized transaction list. The DOMS/PSS buffer was not changed.',
  }
}
