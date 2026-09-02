import type {
  DomsBackOfficeRecord,
  DomsServiceMessageRecord,
} from '@/src/modules/forecourt/infrastructure/jpl/specialRecords'

import { toResponseEnvelopeData } from '@/src/platform/integrations/jpl/protocol/snapshots'
import { logger } from '@/src/shared/utils/logger'

import {
  isEmptyDomsBackOfficeRecord,
  normalizeDomsBackOfficeRecord,
  normalizeDomsServiceMessageRecord,
} from '@/src/modules/forecourt/infrastructure/jpl/specialRecords'
import { forecourtJplSpecialRecordsRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplSpecialRecordsRepo'

export type SpecialRecordPersistenceResult<T> =
  | { status: 'persisted'; record: T }
  | { status: 'skipped'; reason: 'missing-sequence' | 'empty-record' }
  | { status: 'failed'; record: T; error: string }

export type SpecialRecordPersistenceDeps = {
  toResponseEnvelopeData: (response: any) => any
  normalizeServiceMessage: typeof normalizeDomsServiceMessageRecord
  normalizeBackOfficeRecord: typeof normalizeDomsBackOfficeRecord
  isEmptyBackOfficeRecord: typeof isEmptyDomsBackOfficeRecord
  repository: Pick<
    typeof forecourtJplSpecialRecordsRepo,
    'upsertServiceMessage' | 'upsertBackOfficeRecord'
  >
  warn: (message: string, details: Record<string, unknown>) => void
}

const DEFAULT_DEPS: SpecialRecordPersistenceDeps = {
  toResponseEnvelopeData,
  normalizeServiceMessage: normalizeDomsServiceMessageRecord,
  normalizeBackOfficeRecord: normalizeDomsBackOfficeRecord,
  isEmptyBackOfficeRecord: isEmptyDomsBackOfficeRecord,
  repository: forecourtJplSpecialRecordsRepo,
  warn: (message, details) => logger.warn(message, details),
}

const resolveDeps = (
  overrides?: Partial<SpecialRecordPersistenceDeps>,
): SpecialRecordPersistenceDeps => ({ ...DEFAULT_DEPS, ...overrides })

const toErrorDetails = (error: unknown) => ({
  name: error instanceof Error ? error.name : 'Error',
  message:
    error instanceof Error ? error.message : String(error ?? 'Unknown error'),
})

export async function persistCollectedServiceMessage(
  stationId: string,
  response: any,
  dependencyOverrides?: Partial<SpecialRecordPersistenceDeps>,
): Promise<SpecialRecordPersistenceResult<DomsServiceMessageRecord>> {
  const deps = resolveDeps(dependencyOverrides)
  const payload = deps.toResponseEnvelopeData(response) ?? {}
  const record = deps.normalizeServiceMessage({
    stationId,
    seqNo: payload?.FcServiceMsgSeqNo,
    message: payload?.FcServiceMsg,
    payload,
  })

  if (!record.seqNo) {
    return { status: 'skipped', reason: 'missing-sequence' }
  }

  try {
    await deps.repository.upsertServiceMessage(record)
    return { status: 'persisted', record }
  } catch (error) {
    const details = toErrorDetails(error)
    deps.warn('[jpl]', {
      action: 'persistServiceMessage',
      stationId,
      seqNo: record.seqNo,
      error: details,
    })
    return { status: 'failed', record, error: details.message }
  }
}

export async function persistCollectedBackOfficeRecord(
  stationId: string,
  response: any,
  usedSubCode: string,
  dependencyOverrides?: Partial<SpecialRecordPersistenceDeps>,
): Promise<SpecialRecordPersistenceResult<DomsBackOfficeRecord>> {
  const deps = resolveDeps(dependencyOverrides)
  const payload = deps.toResponseEnvelopeData(response) ?? {}
  const record = deps.normalizeBackOfficeRecord({
    stationId,
    subCode: usedSubCode,
    payload,
  })

  if (!record.seqNo) {
    return { status: 'skipped', reason: 'missing-sequence' }
  }
  if (deps.isEmptyBackOfficeRecord(record)) {
    return { status: 'skipped', reason: 'empty-record' }
  }

  try {
    await deps.repository.upsertBackOfficeRecord(record)
    return { status: 'persisted', record }
  } catch (error) {
    const details = toErrorDetails(error)
    deps.warn('[jpl]', {
      action: 'persistBackOfficeRecord',
      stationId,
      borSeqNo: record.seqNo,
      error: details,
    })
    return { status: 'failed', record, error: details.message }
  }
}
