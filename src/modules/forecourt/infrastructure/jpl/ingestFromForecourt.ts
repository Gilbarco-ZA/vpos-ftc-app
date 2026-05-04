import crypto from 'crypto'

import { queryOne } from '@/src/platform/db/postgres'
import { toNumberStrict as numOrNull } from '@/src/shared/numbers'
import { parseDate } from '@/src/shared/utils/dates'
import { logger } from '@/src/shared/utils/logger'
import { shortenUUID } from '@/src/shared/utils/shortenUUID'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { syncDeductionForTransaction } from '@/src/modules/tank-levels/application/syncTransactionTankDeduction'
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
  occurredAt?: Date | string | number | null
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

  const sourceMode =
    args.sourceMode === 'supervised' ? 'supervised' : 'unsupervised'
  const lockId = args.lockId != null ? String(args.lockId) : null
  const dt = resolveTxnDateTime(args.occurredAt) ?? new Date()
  const amount = numOrNull(args.amount)
  const volume = numOrNull(args.volume)
  const totalAmount = amount != null ? Number(amount.toFixed(2)) : null
  const fuelType = strOrNull(args.fuelType)
  const newId = uuidv4()
  const posReference = shortenUUID(newId)

  const jplPayload = {
    sourceMode,
    pumpNumber,
    domsFpId,
    transSeqNo,
    lockId,
    nozzleId: strOrNull(args.nozzleId),
    nozzleNumber: numOrNull(args.nozzleNumber),
    fuelType,
    amount: totalAmount,
    volume,
    occurredAt: dt.toISOString(),
  }
  const payloadHash = buildJplPayloadHash(jplPayload)

  try {
    const linkingWindowSeconds = await getStationLinkingWindowSeconds(stationId)
    const row = await queryOne<{ id: string }>(
      `
      INSERT INTO transactions (
        id, station_id, pump_number, transaction_date_time, total_amount, volume, fuel_type, status,
        pos_reference, linking_window_expires_at, doms_source_system, doms_source_mode, doms_fp_id,
        doms_trans_seq_no, doms_trans_lock_id, doms_payload_json, doms_payload_hash,
        doms_first_seen_at, doms_last_seen_at, doms_reconciled_at
      )
      VALUES (
        $1, $2, $3, $4::timestamptz, $5, $6, $7, 'OPEN', $8,
        CASE WHEN $9::int IS NULL THEN NULL ELSE ($4::timestamptz + ($9::int * INTERVAL '1 second')) END,
        'jpl', $10, $11, $12, $13, $14::jsonb, $15, NOW(), NOW(), NOW()
      )
      ON CONFLICT (station_id, doms_source_mode, doms_fp_id, doms_trans_seq_no)
      WHERE doms_source_system = 'jpl'
        AND doms_trans_seq_no IS NOT NULL
        AND doms_fp_id IS NOT NULL
        AND doms_source_mode IS NOT NULL
      DO UPDATE SET
        transaction_date_time = LEAST(transactions.transaction_date_time, EXCLUDED.transaction_date_time),
        total_amount = EXCLUDED.total_amount,
        volume = EXCLUDED.volume,
        fuel_type = COALESCE(EXCLUDED.fuel_type, transactions.fuel_type),
        doms_trans_lock_id = COALESCE(EXCLUDED.doms_trans_lock_id, transactions.doms_trans_lock_id),
        doms_payload_json = EXCLUDED.doms_payload_json,
        doms_payload_hash = EXCLUDED.doms_payload_hash,
        doms_last_seen_at = NOW(),
        doms_reconciled_at = NOW(),
        updated_at = NOW()
      RETURNING id;
      `,
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
        sourceMode,
        domsFpId,
        transSeqNo,
        lockId ?? 'na',
        JSON.stringify(jplPayload),
        payloadHash,
      ],
    )

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
