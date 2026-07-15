import { query, queryAll, queryOne } from '@/src/platform/db/postgres'

import { transactionQueueSql } from '@/src/modules/transactions/infrastructure/transactionQueueSql'

export type TransactionQueueRow = {
  id: string
  station_id: string
  payload: any
  retry_count: number
  transaction_id: string | null
}

export const transactionQueueRepo = {
  async claimNextBatch(limit = 5) {
    return await queryAll<TransactionQueueRow>(
      transactionQueueSql.claimNextBatch,
      [limit],
    )
  },

  async claimPendingForStation(stationId: string, limit: number) {
    return await queryAll<TransactionQueueRow>(
      transactionQueueSql.claimPendingForStation,
      [stationId, limit],
    )
  },

  async claimNextCreditNoteBatch(limit = 5) {
    return await queryAll<TransactionQueueRow>(
      transactionQueueSql.claimNextCreditNoteBatch,
      [limit],
    )
  },

  async claimPendingCreditNotesForStation(stationId: string, limit: number) {
    return await queryAll<TransactionQueueRow>(
      transactionQueueSql.claimPendingCreditNotesForStation,
      [stationId, limit],
    )
  },

  async markDone(id: string) {
    await query(transactionQueueSql.markDone, [id])
  },

  async markFailedTerminal(
    id: string,
    retryCount: number,
    errorMessage: string,
  ) {
    await query(transactionQueueSql.markFailedTerminal, [
      id,
      retryCount,
      errorMessage,
    ])
  },

  async requeuePendingWithDelay(
    id: string,
    retryCount: number,
    errorMessage: string,
    delaySeconds: number,
  ) {
    await query(transactionQueueSql.requeuePendingWithDelay, [
      id,
      retryCount,
      errorMessage,
      String(delaySeconds),
    ])
  },

  async markFailedWithOptionalDelay(
    id: string,
    retryCount: number,
    errorMessage: string,
    delaySeconds: number | null,
  ) {
    await query(transactionQueueSql.markFailedWithOptionalDelay, [
      id,
      retryCount,
      errorMessage,
      delaySeconds,
    ])
  },

  async resetStuckProcessing(stationId: string, stuckAfterMs: number) {
    await query(transactionQueueSql.resetStuckProcessing, [
      stationId,
      stuckAfterMs,
    ])
  },

  async requeueReadyFailures(stationId: string) {
    await query(transactionQueueSql.requeueReadyFailures, [stationId])
  },

  async updatePayload(id: string, payload: unknown) {
    await query(transactionQueueSql.updatePayload, [
      id,
      JSON.stringify(payload ?? null),
    ])
  },

  async findTransactionByQueueId(stationId: string, queueId: string) {
    return await queryOne<any>(
      transactionQueueSql.selectExistingTransactionByQueueId,
      [stationId, queueId],
    )
  },

  async findTransactionByTransactionId(
    transactionId: string,
    stationId: string,
  ) {
    return await queryOne<any>(
      transactionQueueSql.selectExistingTransactionById,
      [transactionId, stationId],
    )
  },

  async enqueueForTransaction(
    stationId: string,
    queueId: string,
    transactionId: string,
    payload: unknown,
  ) {
    await query(transactionQueueSql.enqueueForTransaction, [
      queueId,
      stationId,
      JSON.stringify(payload ?? null),
      transactionId,
    ])
  },
}
