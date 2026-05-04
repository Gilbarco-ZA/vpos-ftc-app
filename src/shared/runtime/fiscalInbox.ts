import type {
  FiscalInboxMetrics,
  FiscalInboxQueueRow,
  FiscalInboxTopic,
} from '@/src/modules/fiscal-inbox/application/ports/fiscal-inbox-repository.port'

import {
  ensurePlainObject,
  requireNonEmptyString,
  toPositiveInt,
} from '@/src/shared/utils/inputs'

import { markFiscalMessageProcessed } from '@/src/modules/fiscal-inbox/application/commands/mark-fiscal-message-processed'
import { listFiscalInboxQuery } from '@/src/modules/fiscal-inbox/application/queries/list-fiscal-inbox'
import { fiscalInboxRepository } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository'

import { getRuntimeBus } from './bus'

export type FiscalInboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'DEAD'

export type EnqueueFiscalInboxArgs = {
  stationId: string
  topic?: 'fiscal' | 'pos' | 'external_fiscalization'
  requestId?: string | null
  message: Record<string, unknown>
}

export type EnqueueFiscalInboxReviewItemArgs = {
  stationId: string
  transactionId: string
  requestId?: string | null
  errorText?: string | null
  message?: Record<string, unknown> | null
}

export async function enqueueFiscalInboxReviewItem(
  args: EnqueueFiscalInboxReviewItemArgs,
) {
  const stationId = requireNonEmptyString(args.stationId, 'stationId')
  const transactionId = requireNonEmptyString(
    args.transactionId,
    'transactionId',
  )
  const errorText = String(args.errorText || 'Requires manual fiscal review')
  const id = await enqueueFiscalInboxMessage({
    stationId,
    topic: 'external_fiscalization',
    requestId: args.requestId ?? `txn-review:${transactionId}`,
    message: {
      type: 'transactionFiscalizationReviewRequired',
      stationId,
      transactionId,
      error: errorText,
      requiresManualReview: true,
      at: Date.now(),
      ...(ensurePlainObject(args.message ?? {}, {}) as Record<string, unknown>),
    },
  })

  if (id != null) {
    await fiscalInboxRepository.markDeadById({
      id: Number(id),
      stationId,
      errorText,
    })
  }

  return id
}

export type ListFiscalInboxArgs = {
  stationId: string
  status?: FiscalInboxStatus | 'ANY'
  topic?: FiscalInboxTopic | 'ANY'
  limit?: number
  offset?: number
}

export type FiscalInboxListItem = {
  id: number
  stationId: string
  topic: FiscalInboxTopic
  status: FiscalInboxStatus
  requestId: string | null
  attemptCount: number
  nextAttemptAt: string | null
  receivedAt: string | null
  processedAt: string | null
  deadAt: string | null
  errorText: string | null
  relatedTransactionId: string | null
  relatedTransactionStatus: string | null
  message: Record<string, unknown>
}

export async function enqueueFiscalInboxMessage(args: EnqueueFiscalInboxArgs) {
  return await fiscalInboxRepository.enqueue({
    stationId: requireNonEmptyString(args.stationId, 'stationId'),
    topic: args.topic ?? 'fiscal',
    requestId: args.requestId != null ? String(args.requestId) : null,
    message: ensurePlainObject(args.message, args.message),
  })
}

export type EnqueueFiscalInboxReviewFailureArgs = EnqueueFiscalInboxArgs & {
  error: unknown
  markDead?: boolean
}

export async function enqueueFiscalInboxReviewFailure(
  args: EnqueueFiscalInboxReviewFailureArgs,
) {
  const stationId = requireNonEmptyString(args.stationId, 'stationId')
  const id = await fiscalInboxRepository.enqueue({
    stationId,
    topic: args.topic ?? 'external_fiscalization',
    requestId: args.requestId != null ? String(args.requestId) : null,
    message: ensurePlainObject(args.message, args.message),
  })
  if (!id) return null

  const errorText = String((args.error as Error)?.message ?? args.error)
  if (args.markDead ?? true) {
    await fiscalInboxRepository.markDeadById({ id, stationId, errorText })
  } else {
    await fiscalInboxRepository.markFailedById({ id, stationId, errorText })
  }
  return id
}

async function claimBatch(limit: number): Promise<FiscalInboxQueueRow[]> {
  return await fiscalInboxRepository.claimBatch(limit)
}

async function markProcessed(row: FiscalInboxQueueRow) {
  await markFiscalMessageProcessed({
    id: Number(row.id),
    stationId: String(row.station_id || ''),
  })
}

async function markFailed(row: FiscalInboxQueueRow, err: unknown) {
  await fiscalInboxRepository.markDeliveryFailed({
    id: Number(row.id),
    errorText: String((err as Error)?.message ?? err),
    maxAttempts: 10,
  })
}

export async function getFiscalInboxMetrics(stationId: string) {
  const sid = String(stationId || '')
  if (!sid) return null
  return (await fiscalInboxRepository.getMetricsByStation(
    sid,
  )) as FiscalInboxMetrics | null
}

export async function listFiscalInbox(args: ListFiscalInboxArgs) {
  return (await listFiscalInboxQuery({
    stationId: requireNonEmptyString(args.stationId, 'stationId'),
    status: args.status,
    topic: args.topic,
    limit: args.limit,
    offset: args.offset,
  })) as {
    total: number
    limit: number
    offset: number
    items: FiscalInboxListItem[]
  }
}

export async function processFiscalInbox(limit?: number) {
  return await processFiscalInboxBatch(
    limit == null ? undefined : { limit: toPositiveInt(limit, 50, 200) },
  )
}

export async function processFiscalInboxBatch(
  opts: {
    limit?: number
  } = {},
) {
  const limit = Math.max(1, Math.min(200, Number(opts.limit ?? 50)))
  const bus = getRuntimeBus()

  const rows = await claimBatch(limit)
  if (!rows.length) return 0

  for (const row of rows) {
    try {
      const msg = ensurePlainObject<Record<string, unknown>>(
        row.message_json,
        {},
      )
      if (!('stationId' in msg)) {
        msg.stationId = row.station_id
      }
      await bus.publish(row.topic, msg)
      await markProcessed(row)
    } catch (error) {
      await markFailed(row, error)
    }
  }

  return rows.length
}

export async function drainFiscalInbox(
  opts: {
    limitPerBatch?: number
    maxLoops?: number
  } = {},
) {
  const limitPerBatch = Number(opts.limitPerBatch ?? 50)
  const maxLoops = Math.max(1, Math.min(50, Number(opts.maxLoops ?? 5)))

  let total = 0
  for (let i = 0; i < maxLoops; i++) {
    const count = await processFiscalInboxBatch({ limit: limitPerBatch })
    total += count
    if (count === 0) break
  }
  return total
}

export type EnqueueExternalFiscalizationArgs = {
  stationId: string
  transactionId: string
  payload: Record<string, unknown>
  requestId?: string | null
}

export async function enqueueExternalFiscalization(
  args: EnqueueExternalFiscalizationArgs,
) {
  return await enqueueFiscalInboxMessage({
    stationId: requireNonEmptyString(args.stationId, 'stationId'),
    topic: 'external_fiscalization',
    requestId: args.requestId ?? null,
    message: {
      transactionId: requireNonEmptyString(args.transactionId, 'transactionId'),
      payload: ensurePlainObject(args.payload, args.payload),
    },
  })
}
