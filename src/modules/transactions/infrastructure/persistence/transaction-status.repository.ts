import type {
  PersistTransactionStatusInput,
  TransactionRepositoryPort,
} from '@/src/modules/transactions/application/ports/transaction-repository.port'
import type { FiscalizationEventWriteDetails } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'
import type { TransactionVehicleDetailsInput } from '@/src/modules/transactions/infrastructure/persistence/transaction.types'

import { queryOne, txQuery, withTransaction } from '@/src/platform/db/postgres'
import { auditReceiptPrinted } from '@/src/shared/audit/log'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { createTransactionStatusService } from '@/src/modules/transactions/application/services/transaction-status-service'
import { normalizeTransactionStatus } from '@/src/modules/transactions/domain/transaction-status'
import { persistFiscalizationEventRepo } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'

import { mapTransactionStatusSnapshot } from './transaction.mapper'
import {
  buildPersistTransactionStatusUpdate,
  getTransactionStatusSnapshotSql,
} from './transaction.sql'

export const queryOneMaybeTx = async (
  client: any | null | undefined,
  sql: string,
  params: unknown[],
) => {
  if (client) {
    const result = await txQuery<any>(client, sql, params)
    return result.rows?.[0] ?? null
  }

  return await queryOne<any>(sql, params)
}

const transactionStatusRepository: TransactionRepositoryPort = {
  async getStatusSnapshot(input) {
    const row = await queryOneMaybeTx(
      input.client,
      getTransactionStatusSnapshotSql,
      [input.stationId, input.transactionId],
    )

    return mapTransactionStatusSnapshot(row)
  },

  async persistStatus(input: PersistTransactionStatusInput) {
    const statement = buildPersistTransactionStatusUpdate(input)
    return await queryOneMaybeTx(input.client, statement.sql, statement.params)
  },
}

const transactionStatusAuditLog = {
  async recordTransactionStatusChange(_entry: {
    stationId: string
    transactionId: string
    previousStatus: string | null
    nextStatus: string
    actorId?: string | null
    metadata?: Record<string, unknown> | null
  }) {
    return
  },
}

export const transactionStatusService = createTransactionStatusService({
  repository: transactionStatusRepository,
  auditLog: transactionStatusAuditLog,
})

const normalizeVehicleDetail = (value: unknown) => {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

export async function allocateTransactionRepo(
  stationId: string,
  transactionId: string,
  customerId: string,
  allocatedBy?: string | null,
  vehicleDetails?: TransactionVehicleDetailsInput | null,
) {
  return await withTransaction(async (client) => {
    const transactionResult = await txQuery<any>(
      client,
      `SELECT odometer, payment_type, vehicle_reg_nr
         FROM transactions
        WHERE station_id = $1
          AND id = $2
          AND deleted_at IS NULL
        FOR UPDATE`,
      [stationId, transactionId],
    )
    const transaction = transactionResult.rows[0]
    if (!transaction) return null

    const suppliedOdometer = normalizeVehicleDetail(vehicleDetails?.odometer)
    const suppliedPaymentType = normalizeVehicleDetail(
      vehicleDetails?.paymentType,
    )
    const suppliedVehicleRegNr = normalizeVehicleDetail(
      vehicleDetails?.vehicleRegNr,
    )

    if (suppliedOdometer || suppliedPaymentType || suppliedVehicleRegNr) {
      await txQuery(
        client,
        `UPDATE transactions
            SET odometer = COALESCE($3, odometer),
                payment_type = COALESCE($4, payment_type),
                vehicle_reg_nr = COALESCE($5, vehicle_reg_nr),
                updated_at = NOW()
          WHERE station_id = $1
            AND id = $2`,
        [
          stationId,
          transactionId,
          suppliedOdometer,
          suppliedPaymentType,
          suppliedVehicleRegNr,
        ],
      )
    }

    const allocated =
      await transactionStatusService.assignCustomerAndMaybeAllocate({
        stationId,
        transactionId,
        customerId,
        allocatedBy: allocatedBy ?? null,
        client,
      })

    if (!allocated) return null

    const odometer =
      suppliedOdometer ?? normalizeVehicleDetail(transaction.odometer)
    const paymentType =
      suppliedPaymentType ?? normalizeVehicleDetail(transaction.payment_type)
    const vehicleRegNr =
      suppliedVehicleRegNr ?? normalizeVehicleDetail(transaction.vehicle_reg_nr)

    await txQuery(
      client,
      `INSERT INTO customer_stations (
          id,
          customer_id,
          station_id,
          first_seen_at,
          last_seen_at,
          is_preferred,
          created_at,
          updated_at
        )
        SELECT $1, $2, $3, NOW(), NOW(), FALSE, NOW(), NOW()
        WHERE EXISTS (
          SELECT 1
            FROM customers c
           WHERE c.id = $2
             AND c.deleted_at IS NULL
        )
        ON CONFLICT (customer_id, station_id) DO UPDATE
          SET last_seen_at = NOW(),
              updated_at = NOW()`,
      [uuidv4(), customerId, stationId],
    )

    await txQuery(
      client,
      `UPDATE customers c
          SET odometer = COALESCE($3, c.odometer),
              payment_type = COALESCE($4, c.payment_type),
              vehicle_reg_nr = COALESCE($5, c.vehicle_reg_nr),
              last_station_id = $1,
              last_seen_at = NOW(),
              updated_at = NOW()
        WHERE c.id = $2
          AND c.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
              FROM customer_stations cs
             WHERE cs.customer_id = c.id
               AND cs.station_id = $1
          )`,
      [stationId, customerId, odometer, paymentType, vehicleRegNr],
    )

    return allocated
  })
}

export async function markTransactionFiscalizingRepo(
  stationId: string,
  transactionId: string,
  client?: any | null,
) {
  return await transactionStatusService.markFiscalizing({
    stationId,
    transactionId,
    client: client ?? null,
  })
}

export async function markTransactionFiscalizedRepo(input: {
  stationId: string
  transactionId: string
  fiscalizationReference?: string | null
  fiscalizationResponse?: unknown
  fiscalDocumentId?: string | null
  fiscalEvent?: FiscalizationEventWriteDetails
  client?: any | null
}) {
  if (input.fiscalEvent) {
    const fiscalEvent = input.fiscalEvent
    const persist = async (client: any) => {
      const recorded = await persistFiscalizationEventRepo({
        stationId: input.stationId,
        transactionId: input.transactionId,
        status: 'SUCCESS',
        ...fiscalEvent,
        reference:
          fiscalEvent.reference ?? input.fiscalizationReference ?? null,
        fiscalDocumentId: input.fiscalDocumentId ?? null,
        client,
      })

      return await transactionStatusService.markFiscalized({
        stationId: input.stationId,
        transactionId: input.transactionId,
        fiscalizationReference: input.fiscalizationReference ?? null,
        fiscalizationResponse: recorded.compatibilitySummary,
        fiscalDocumentId: input.fiscalDocumentId ?? null,
        latestFiscalEventId: recorded.event.id,
        client,
      })
    }

    if (input.client) return await persist(input.client)
    return await withTransaction(persist)
  }

  return await transactionStatusService.markFiscalized(input)
}

export async function markTransactionFailedRepo(input: {
  stationId: string
  transactionId: string
  lastError?: string | null
  incrementRetryCount?: boolean
  fiscalDocumentId?: string | null
  fiscalizationResponse?: unknown
  fiscalEvent?: FiscalizationEventWriteDetails
  client?: any | null
}) {
  if (input.fiscalEvent) {
    const fiscalEvent = input.fiscalEvent
    const persist = async (client: any) => {
      const recorded = await persistFiscalizationEventRepo({
        stationId: input.stationId,
        transactionId: input.transactionId,
        status: 'FAILED',
        ...fiscalEvent,
        errorMessage: fiscalEvent.errorMessage ?? input.lastError ?? null,
        fiscalDocumentId: input.fiscalDocumentId ?? null,
        client,
      })

      return await transactionStatusService.markFailed({
        stationId: input.stationId,
        transactionId: input.transactionId,
        lastError: input.lastError ?? null,
        incrementRetryCount: input.incrementRetryCount ?? false,
        fiscalDocumentId: input.fiscalDocumentId ?? null,
        fiscalizationResponse: recorded.compatibilitySummary,
        latestFiscalEventId: recorded.event.id,
        client,
      })
    }

    if (input.client) return await persist(input.client)
    return await withTransaction(persist)
  }

  return await transactionStatusService.markFailed(input)
}

export async function retryFailedTransactionFiscalizationRepo(
  stationId: string,
  transactionId: string,
) {
  await transactionStatusService.retryFiscalization({
    stationId,
    transactionId,
    client: null,
  })
}

export async function markTransactionReceiptPrintedRepo(input: {
  stationId: string
  transactionId: string
  receiptId: string
  userId?: string | null
  isReprint?: boolean
  ipAddress?: string
}) {
  const snapshot = await transactionStatusRepository.getStatusSnapshot({
    stationId: input.stationId,
    transactionId: input.transactionId,
    client: null,
  })
  if (!snapshot || snapshot.deletedAt != null) return null

  const currentStatus = normalizeTransactionStatus(snapshot.status)
  const nextStatus =
    input.isReprint ||
    currentStatus === 'PRINTED' ||
    currentStatus === 'REPRINTED'
      ? 'REPRINTED'
      : 'PRINTED'

  const updated = await transactionStatusService.transition({
    stationId: input.stationId,
    transactionId: input.transactionId,
    nextStatus,
    actorId: input.userId ?? null,
    metadata: {
      receiptId: input.receiptId,
      isReprint: Boolean(input.isReprint),
    },
    client: null,
  })

  if (input.userId) {
    await auditReceiptPrinted(
      input.stationId,
      input.userId,
      input.receiptId,
      input.transactionId,
      nextStatus === 'REPRINTED',
      input.ipAddress,
    ).catch(() => {})
  }

  return updated
}
