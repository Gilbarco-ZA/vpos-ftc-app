import crypto from 'crypto'

import { txQuery, withTransaction } from '@/src/platform/db/postgres'
import { toNumberStrict as numOrNull } from '@/src/shared/numbers'
import { parseDate } from '@/src/shared/utils/dates'
import { logger } from '@/src/shared/utils/logger'
import { shortenUUID } from '@/src/shared/utils/shortenUUID'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { forecourtPayloadLifecycleRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtPayloadLifecycleRepo'
import { syncDeductionForTransaction } from '@/src/modules/tank-levels/application/syncTransactionTankDeduction'
import { ensureTanzaniaTransactionTankProjection } from '@/src/modules/tanzania-fiscal/infrastructure/transactionTankProjection'
import {
  buildForecourtTransactionCorrelationLockKey,
  normalizeForecourtTransactionCorrelationSeconds,
} from '@/src/modules/transactions/infrastructure/forecourtTransactionCorrelation'
import { getStationLinkingWindowSeconds } from '@/src/modules/transactions/infrastructure/linkingWindow'

export type IngestJplTransactionArgs = {
  sourceMode?: 'supervised' | 'unsupervised'
  stationId: string
  pumpNumber: number
  /** DOMS/JPL FuellingPoint ID. Defaults to pumpNumber for legacy stations. */
  domsFpId?: number | null
  transSeqNo: number
  lockId?: string | number | null
  nozzleId?: string | null
  nozzleNumber?: number | null
  fuelType?: string | null
  amount?: number | null
  volume?: number | null
  /** DOMS transaction Price_e/Price after station decimal scaling. */
  unitPrice?: number | null
  occurredAt?: Date | string | number | null
  /** Stable identity for one physical DOMS transaction incarnation. */
  transactionIdentity: string
  /**
   * When true, only attach the DOMS incarnation to an already captured
   * pump-session transaction. Do not create a mapping-incomplete JPL row.
   */
  requireExistingSessionMatch?: boolean
}

function strOrNull(v: any): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
}

const resolveTxnDateTime = (value: any): Date | null => parseDate(value)

function buildJplPayloadHash(payload: Record<string, unknown>): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
}

async function ingestJplTransaction(args: IngestJplTransactionArgs) {
  const stationId = String(args.stationId)
  const pumpNumber = Number(args.pumpNumber)
  const domsFpId = numOrNull(args.domsFpId) ?? pumpNumber
  const transSeqNo = Number(args.transSeqNo)
  if (!Number.isFinite(pumpNumber) || !Number.isFinite(transSeqNo)) return null

  const transactionIdentity = String(args.transactionIdentity ?? '').trim()
  if (!transactionIdentity) return null

  const sourceMode =
    args.sourceMode === 'supervised' ? 'supervised' : 'unsupervised'
  const lockId = args.lockId != null ? String(args.lockId) : null
  const dt = resolveTxnDateTime(args.occurredAt) ?? new Date()
  const amount = numOrNull(args.amount)
  const volume = numOrNull(args.volume)
  const unitPrice = numOrNull(args.unitPrice)
  const totalAmount = amount != null ? Number(amount.toFixed(2)) : null
  const fuelType = strOrNull(args.fuelType)
  const nozzleId = strOrNull(args.nozzleId)
  const nozzleNumber = numOrNull(args.nozzleNumber)
  const newId = uuidv4()
  const posReference = shortenUUID(newId)

  const jplPayload = {
    sourceMode,
    pumpNumber,
    domsFpId,
    transSeqNo,
    lockId,
    nozzleId,
    nozzleNumber,
    fuelType,
    amount: totalAmount,
    volume,
    unitPrice,
    occurredAt: dt.toISOString(),
    transactionIdentity,
  }
  const payloadHash = buildJplPayloadHash(jplPayload)

  try {
    const linkingWindowSeconds = await getStationLinkingWindowSeconds(stationId)
    const correlationSeconds =
      normalizeForecourtTransactionCorrelationSeconds(linkingWindowSeconds)
    const correlationLockKey = buildForecourtTransactionCorrelationLockKey({
      stationId,
      pumpNumber,
      nozzleNumber,
    })

    const row = await withTransaction(async (client) => {
      await txQuery(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
        correlationLockKey,
      ])

      const existingByIdentity = await txQuery<{ id: string }>(
        client,
        `SELECT id
           FROM transactions
          WHERE station_id = $1::uuid
            AND doms_source_system = 'jpl'
            AND doms_transaction_identity = $2
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE`,
        [stationId, transactionIdentity],
      )

      const existingJplId = existingByIdentity.rows[0]?.id ?? null
      if (existingJplId) {
        const updated = await txQuery<{ id: string }>(
          client,
          `UPDATE transactions
              SET transaction_date_time = CASE
                    WHEN status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED') THEN transaction_date_time
                    ELSE LEAST(transaction_date_time, $3::timestamptz)
                  END,
                  total_amount = CASE
                    WHEN status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED') THEN total_amount
                    ELSE COALESCE($4, total_amount)
                  END,
                  volume = CASE
                    WHEN status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED') THEN volume
                    ELSE COALESCE($5, volume)
                  END,
                  fuel_type = COALESCE($6, fuel_type),
                  nozzle_id = COALESCE(nozzle_id, $7::uuid),
                  nozzle_number = COALESCE(nozzle_number, $8::int),
                  doms_trans_lock_id = COALESCE($9, doms_trans_lock_id),
                  doms_payload_json = $10::jsonb,
                  doms_payload_cleared_at = NULL,
                  doms_payload_clear_reason = NULL,
                  doms_payload_hash = $11,
                  doms_last_seen_at = NOW(),
                  doms_normalized_at = COALESCE(doms_normalized_at, NOW()),
                  doms_reconciled_at = NOW(),
                  updated_at = NOW()
            WHERE station_id = $1::uuid
              AND id = $2::uuid
            RETURNING id`,
          [
            stationId,
            existingJplId,
            dt,
            totalAmount,
            volume,
            fuelType,
            nozzleId,
            nozzleNumber,
            lockId ?? 'na',
            JSON.stringify(jplPayload),
            payloadHash,
          ],
        )
        return updated.rows[0] ?? null
      }

      // Pump-state/session capture and DOMS transaction-buffer capture describe
      // the same physical sale. If the session path already created the row,
      // attach the JPL incarnation to it instead of inserting a second sale.
      const sessionCandidate = await txQuery<{ id: string }>(
        client,
        `SELECT id
           FROM transactions
          WHERE station_id = $1::uuid
            AND pump_number = $2::int
            AND deleted_at IS NULL
            AND doms_transaction_identity IS NULL
            AND pos_reference LIKE 'forecourt:%'
            AND ($3::int IS NULL OR nozzle_number = $3::int)
            AND ($4::numeric IS NOT NULL OR $5::numeric IS NOT NULL)
            AND ($4::numeric IS NULL OR ABS(total_amount - $4::numeric) <= 0.01)
            AND ($5::numeric IS NULL OR ABS(volume - $5::numeric) <= 0.001)
            AND ABS(EXTRACT(EPOCH FROM (transaction_date_time - $6::timestamptz))) <= $7::int
          ORDER BY ABS(EXTRACT(EPOCH FROM (transaction_date_time - $6::timestamptz))) ASC,
                   transaction_date_time DESC
          LIMIT 1
          FOR UPDATE`,
        [
          stationId,
          pumpNumber,
          nozzleNumber,
          totalAmount,
          volume,
          dt,
          correlationSeconds,
        ],
      )

      const sessionTransactionId = sessionCandidate.rows[0]?.id ?? null
      if (sessionTransactionId) {
        const linked = await txQuery<{ id: string }>(
          client,
          `UPDATE transactions
              SET transaction_date_time = CASE
                    WHEN status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED') THEN transaction_date_time
                    ELSE LEAST(transaction_date_time, $3::timestamptz)
                  END,
                  total_amount = CASE
                    WHEN status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED') THEN total_amount
                    ELSE COALESCE($4, total_amount)
                  END,
                  volume = CASE
                    WHEN status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED') THEN volume
                    ELSE COALESCE($5, volume)
                  END,
                  fuel_type = COALESCE($6, fuel_type),
                  nozzle_id = COALESCE(nozzle_id, $7::uuid),
                  nozzle_number = COALESCE(nozzle_number, $8::int),
                  doms_source_system = 'jpl',
                  doms_source_mode = $9,
                  doms_fp_id = $10::int,
                  doms_trans_seq_no = $11::int,
                  doms_trans_lock_id = $12,
                  doms_transaction_identity = $13,
                  doms_payload_json = $14::jsonb,
                  doms_payload_cleared_at = NULL,
                  doms_payload_clear_reason = NULL,
                  doms_payload_hash = $15,
                  doms_first_seen_at = COALESCE(doms_first_seen_at, NOW()),
                  doms_last_seen_at = NOW(),
                  doms_normalized_at = COALESCE(doms_normalized_at, NOW()),
                  doms_reconciled_at = NOW(),
                  updated_at = NOW()
            WHERE station_id = $1::uuid
              AND id = $2::uuid
            RETURNING id`,
          [
            stationId,
            sessionTransactionId,
            dt,
            totalAmount,
            volume,
            fuelType,
            nozzleId,
            nozzleNumber,
            sourceMode,
            domsFpId,
            transSeqNo,
            lockId ?? 'na',
            transactionIdentity,
            JSON.stringify(jplPayload),
            payloadHash,
          ],
        )
        return linked.rows[0] ?? null
      }

      if (args.requireExistingSessionMatch) {
        return null
      }

      const inserted = await txQuery<{ id: string }>(
        client,
        `INSERT INTO transactions (
          id, station_id, pump_number, transaction_date_time, total_amount, volume, fuel_type, status,
          pos_reference, linking_window_expires_at, nozzle_id, nozzle_number,
          doms_source_system, doms_source_mode, doms_fp_id,
          doms_trans_seq_no, doms_trans_lock_id, doms_transaction_identity, doms_payload_json, doms_payload_hash,
          doms_first_seen_at, doms_last_seen_at, doms_normalized_at, doms_reconciled_at
        )
        VALUES (
          $1, $2, $3, $4::timestamptz, $5, $6, $7, 'OPEN', $8,
          CASE WHEN $9::int IS NULL THEN NULL ELSE ($4::timestamptz + ($9::int * INTERVAL '1 second')) END,
          $10::uuid, $11::int,
          'jpl', $12, $13, $14, $15, $16, $17::jsonb, $18, NOW(), NOW(), NOW(), NOW()
        )
        ON CONFLICT (station_id, doms_transaction_identity)
        WHERE doms_source_system = 'jpl'
          AND doms_transaction_identity IS NOT NULL
        DO UPDATE SET
          transaction_date_time = LEAST(transactions.transaction_date_time, EXCLUDED.transaction_date_time),
          total_amount = EXCLUDED.total_amount,
          volume = EXCLUDED.volume,
          fuel_type = COALESCE(EXCLUDED.fuel_type, transactions.fuel_type),
          nozzle_id = COALESCE(transactions.nozzle_id, EXCLUDED.nozzle_id),
          nozzle_number = COALESCE(transactions.nozzle_number, EXCLUDED.nozzle_number),
          doms_trans_lock_id = COALESCE(EXCLUDED.doms_trans_lock_id, transactions.doms_trans_lock_id),
          doms_payload_json = EXCLUDED.doms_payload_json,
          doms_payload_cleared_at = NULL,
          doms_payload_clear_reason = NULL,
          doms_payload_hash = EXCLUDED.doms_payload_hash,
          doms_last_seen_at = NOW(),
          doms_normalized_at = COALESCE(transactions.doms_normalized_at, NOW()),
          doms_reconciled_at = NOW(),
          updated_at = NOW()
        RETURNING id`,
        [
          newId,
          stationId,
          pumpNumber,
          dt,
          totalAmount,
          volume,
          fuelType,
          posReference,
          linkingWindowSeconds,
          nozzleId,
          nozzleNumber,
          sourceMode,
          domsFpId,
          transSeqNo,
          lockId ?? 'na',
          transactionIdentity,
          JSON.stringify(jplPayload),
          payloadHash,
        ],
      )
      return inserted.rows[0] ?? null
    })

    if (row?.id) {
      try {
        await forecourtPayloadLifecycleRepo.markNormalizedOwner({
          stationId,
          sourceMode,
          fpId: domsFpId,
          transSeqNo,
          transactionId: String(row.id),
        })
      } catch (ownerError: any) {
        // The transaction row is already durable at this point, but replay
        // ownership/checkpoint correlation is part of the clear safety proof.
        // Fail closed so DOMS is not cleared until that correlation succeeds.
        logger.error('[INGEST]', {
          msg: 'transaction persisted but DOMS lifecycle ownership update failed',
          transactionId: String(row.id),
          stationId,
          sourceMode,
          domsFpId,
          transSeqNo,
          error: ownerError?.message ?? String(ownerError),
        })
        return null
      }
    }

    if (row?.id && volume != null && Number(volume) > 0) {
      await syncDeductionForTransaction(stationId, String(row.id)).catch(
        (err) => {
          logger.error('[INGEST]', {
            msg: 'Failed to sync tank deduction for ingested fuel transaction',
            error: err,
            transactionId: String(row.id),
          })
        },
      )
      await ensureTanzaniaTransactionTankProjection({
        stationId,
        transactionId: String(row.id),
      }).catch((err) => {
        logger.error('[INGEST]', {
          msg: 'Failed to capture Tanzania transaction tank projection',
          error: err,
          transactionId: String(row.id),
        })
      })
    }

    logger.info('[INGEST]', {
      msg: 'transaction upserted',
      id: row?.id,
      stationId,
      pumpNumber,
      domsFpId,
      transSeqNo,
      lockId: lockId ?? 'na',
      totalAmount,
      volume,
      unitPrice,
      fuelType,
      posReference,
      sourceMode,
      payloadHash,
    })

    return row?.id ?? null
  } catch (e: any) {
    logger.error('[INGEST]', {
      msg: 'failed to upsert transaction',
      stationId,
      pumpNumber,
      domsFpId,
      transSeqNo,
      lockId: lockId ?? 'na',
      totalAmount,
      volume,
      unitPrice,
      fuelType,
      posReference,
      sourceMode,
      payloadHash,
      error: e?.message ?? String(e),
    })
    return null
  }
}

export async function ingestJplUnsupervisedTransaction(
  args: IngestJplTransactionArgs,
) {
  return ingestJplTransaction(args)
}

export async function ingestJplSupervisedTransaction(
  args: IngestJplTransactionArgs,
) {
  return ingestJplTransaction(args)
}