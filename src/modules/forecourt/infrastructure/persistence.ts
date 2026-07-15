import { query, txQuery, withTransaction } from '@/src/platform/db/postgres'
import { logger } from '@/src/shared/utils/logger'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { extractJplUnattendedReceiptCapture } from '@/src/modules/forecourt/infrastructure/jpl/unattendedTransactions'
import { normalizeForecourtEvent } from '@/src/modules/forecourt/infrastructure/normalize'

type ForecourtEventInsert = {
  stationId: string
  source: string
  apc?: string | null
  eventType: string
  payload: any
  occurredAt?: Date | string | number | null
}

function coerceOccurredAt(value: any): Date {
  if (!value) return new Date()
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

function extractFpId(payload: any): number | null {
  const p = payload ?? {}
  const candidates = [
    p.fpId,
    p.fp_id,
    p.fpNumber,
    p.fp_number,
    p.pumpId,
    p.pump_id,
    p.pumpNumber,
    p.pump_number,
  ]
  for (const c of candidates) {
    const n = Number(c)
    if (Number.isFinite(n) && n > 0) return Math.trunc(n)
  }
  return null
}

function extractStatus(payload: any): string | null {
  const p = payload ?? {}
  const candidates = [p.status, p.state, p.pumpState, p.fpState]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

export async function recordForecourtEvent(input: ForecourtEventInsert) {
  const id = uuidv4()
  const occurredAt = coerceOccurredAt(input.occurredAt)
  const fpId = extractFpId(input.payload)
  const status = extractStatus(input.payload)

  // 1) Always try to append the raw event first.
  await query(
    `INSERT INTO forecourt_events
      (id, station_id, source, apc, event_type, payload, occurred_at, received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
    [
      id,
      input.stationId,
      input.source,
      input.apc ?? null,
      input.eventType,
      input.payload ?? {},
      occurredAt,
    ],
  )

  // 2) Everything else is best-effort state materialization.
  queueMicrotask(() => {
    void materializeForecourtEventState({
      id,
      stationId: input.stationId,
      eventType: input.eventType,
      payload: input.payload ?? {},
      occurredAt,
      fpId,
      status,
    }).catch((err) => {
      logger.error('[forecourt]', {
        msg: 'state materialization failed',
        error: err,
      })
    })
  })

  return { id, fpId }
}

async function materializeForecourtEventState(args: {
  id: string
  stationId: string
  eventType: string
  payload: any
  occurredAt: Date
  fpId: number | null
  status: string | null
}) {
  const { id, stationId, eventType, payload, occurredAt, fpId, status } = args
  const norm = normalizeForecourtEvent(eventType, payload)

  await withTransaction(async (client) => {
    if (fpId != null) {
      await txQuery(
        client,
        `INSERT INTO forecourt_state
          (id, station_id, fp_id, status, last_event_id, last_event_type, data, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (station_id, fp_id)
         DO UPDATE SET status = COALESCE(EXCLUDED.status, forecourt_state.status),
                       last_event_id = EXCLUDED.last_event_id,
                       last_event_type = EXCLUDED.last_event_type,
                       data = EXCLUDED.data,
                       updated_at = NOW()`,
        [uuidv4(), stationId, fpId, status, id, eventType, payload],
      )
    }

    if (norm.pumpStatus?.fpId != null) {
      await txQuery(
        client,
        `UPDATE forecourt_state
           SET status = COALESCE($3, status),
               data = $4,
               updated_at = NOW()
         WHERE station_id = $1 AND fp_id = $2`,
        [
          stationId,
          norm.pumpStatus.fpId,
          norm.pumpStatus.status ?? null,
          norm.pumpStatus.data ?? {},
        ],
      )
    }

    if (norm.priceSetStatus?.priceSetId != null) {
      await txQuery(
        client,
        `INSERT INTO forecourt_price_sets (station_id, price_set_id, effective_at, data, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (station_id, price_set_id)
         DO UPDATE SET effective_at = COALESCE(EXCLUDED.effective_at, forecourt_price_sets.effective_at),
                       data = EXCLUDED.data,
                       updated_at = NOW()`,
        [
          stationId,
          norm.priceSetStatus.priceSetId,
          norm.priceSetStatus.effectiveAt ?? null,
          norm.priceSetStatus.data ?? {},
        ],
      )
    }

    if (norm.priceSet?.priceSetId != null) {
      await txQuery(
        client,
        `INSERT INTO forecourt_price_sets (station_id, price_set_id, effective_at, data, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (station_id, price_set_id)
         DO UPDATE SET effective_at = COALESCE(EXCLUDED.effective_at, forecourt_price_sets.effective_at),
                       data = EXCLUDED.data,
                       updated_at = NOW()`,
        [
          stationId,
          norm.priceSet.priceSetId,
          norm.priceSet.effectiveAt ?? null,
          norm.priceSet.data ?? {},
        ],
      )

      for (const p of norm.priceSet.prices ?? []) {
        await txQuery(
          client,
          `INSERT INTO forecourt_prices
             (station_id, price_set_id, price_group_id, grade_id, price, updated_at)
           VALUES ($1,$2,$3,$4,$5,NOW())
           ON CONFLICT (station_id, price_set_id, price_group_id, grade_id)
           DO UPDATE SET price = EXCLUDED.price,
                         updated_at = NOW()`,
          [
            stationId,
            norm.priceSet.priceSetId,
            p.priceGroupId,
            p.gradeId,
            p.price,
          ],
        )
      }
    }

    if (norm.transactions?.length) {
      for (const t of norm.transactions) {
        const unattendedCapture = extractJplUnattendedReceiptCapture(t.raw ?? t)

        await txQuery(
          client,
          `INSERT INTO forecourt_transactions
             (id, station_id, fp_id, is_supported, trans_seq_no, sm_id, trans_lock_id, trans_info_mask,
              money_due, volume, occurred_at, raw,
              doms_external_payment_reference, doms_ept_id, doms_ept_sequence_no,
              doms_ept_receipt_format_id, doms_receipt_no, doms_card_label,
              doms_card_pan_masked, doms_unattended_receipt_json, doms_unattended_payment_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [
            uuidv4(),
            stationId,
            t.fpId ?? fpId ?? null,
            t.isSupported,
            t.transSeqNo ?? null,
            t.smId ?? null,
            t.transLockId ?? null,
            t.transInfoMask ?? null,
            t.moneyDue ?? null,
            t.volume ?? null,
            occurredAt,
            t.raw ?? {},
            unattendedCapture.externalPaymentReference ?? null,
            unattendedCapture.eptId ?? null,
            unattendedCapture.eptSeqNo ?? null,
            unattendedCapture.eptReceiptFormatId ?? null,
            unattendedCapture.receiptNo ?? null,
            unattendedCapture.cardLabel ?? null,
            unattendedCapture.cardPanMasked ?? null,
            unattendedCapture.receiptJson ?? null,
            unattendedCapture.paymentJson ?? null,
          ],
        )
      }
    }
  })
}
