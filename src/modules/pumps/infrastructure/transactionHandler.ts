/**
 * Transaction Handler for Pump Events
 *
 * Creates transactions when dispensing completes.
 */

import { createHash } from 'node:crypto'
import type { FuelingSession } from '@/src/modules/forecourt/infrastructure/sessions/fuelingSessions'
import type { NozzleState, PumpStateSnapshot } from '@/src/shared/pumps/types'

import { queryOne, txQuery, withTransaction } from '@/src/platform/db/postgres'
import { toNumberStrict as parseNumber } from '@/src/shared/numbers'
import { logger } from '@/src/shared/utils/logger'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { enqueueFiscalInboxMessage } from '@/src/modules/fiscal-inbox/application/fiscalInbox'
import {
  requestPostSaleTotalsRefresh,
  startSaleTotalsPolling,
  stopTotalsPolling,
} from '@/src/modules/forecourt/infrastructure/polling/totalsPoller'
import {
  cleanupFuelingSessions,
  clearFuelingCompletionCandidate,
  computeDispensedAmount,
  computeDispensedVolume,
  getFuelingSession,
  isFuelingReadyToFinalize,
  markFuelingCompletionCandidate,
  notePostSaleTotalsSeen,
  updateFuelingFromState,
  updateFuelingMetrics,
} from '@/src/modules/forecourt/infrastructure/sessions/fuelingSessions'
import { syncDeductionForTransaction } from '@/src/modules/tank-levels/application/syncTransactionTankDeduction'
import { ensureTanzaniaTransactionTankProjection } from '@/src/modules/tanzania-fiscal/infrastructure/transactionTankProjection'
import {
  buildForecourtTransactionCorrelationLockKey,
  normalizeForecourtTransactionCorrelationSeconds,
} from '@/src/modules/transactions/infrastructure/forecourtTransactionCorrelation'
import { getStationLinkingWindowSecondsTx } from '@/src/modules/transactions/infrastructure/linkingWindow'

type NozzleNumberCache = Map<string, number>
type NozzleNumberInflight = Map<string, Promise<number | null>>

const getNozzleNumberCache = () => {
  const anyGlobal = globalThis as any
  if (!anyGlobal.__vposNozzleNumberCache) {
    anyGlobal.__vposNozzleNumberCache = new Map<
      string,
      number
    >() as NozzleNumberCache
  }
  return anyGlobal.__vposNozzleNumberCache as NozzleNumberCache
}

const getNozzleNumberInflight = () => {
  const anyGlobal = globalThis as any
  if (!anyGlobal.__vposNozzleNumberInflight) {
    anyGlobal.__vposNozzleNumberInflight = new Map<
      string,
      Promise<number | null>
    >() as NozzleNumberInflight
  }
  return anyGlobal.__vposNozzleNumberInflight as NozzleNumberInflight
}

const resolveNozzleNumber = async (opts: {
  stationId: string
  pumpNumber: number
  nozzleId: string
}) => {
  const cache = getNozzleNumberCache()
  const inflight = getNozzleNumberInflight()
  const cacheKey = `${opts.stationId}:${opts.pumpNumber}:${opts.nozzleId}`
  const cached = cache.get(cacheKey)
  if (cached != null) return cached

  const existing = inflight.get(cacheKey)
  if (existing) return await existing

  const loadPromise = (async () => {
    const row = await queryOne<{ nozzle_number: number }>(
      `SELECT n.nozzle_number
         FROM nozzles n
         JOIN pumps p ON p.id = n.pump_id AND p.station_id = n.station_id
        WHERE n.station_id = $1
          AND p.pump_number = $2
          AND p.status <> 'INACTIVE'
          AND n.is_active = TRUE
          AND n.id = $3
        LIMIT 1`,
      [opts.stationId, opts.pumpNumber, opts.nozzleId],
    )

    if (row?.nozzle_number != null) {
      cache.set(cacheKey, row.nozzle_number)
      return row.nozzle_number
    }

    return null
  })()

  inflight.set(cacheKey, loadPromise)
  try {
    return await loadPromise
  } finally {
    if (inflight.get(cacheKey) === loadPromise) {
      inflight.delete(cacheKey)
    }
  }
}

const normalizeFuelingState = (state: NozzleState) => {
  const raw = String(state ?? '').toLowerCase()
  if (raw.includes('dispens') || raw === 'nozzle_up' || raw === 'up')
    return 'dispensing'
  if (
    raw.includes('idle') ||
    raw.includes('end') ||
    raw === 'nozzle_down' ||
    raw === 'down'
  )
    return 'idle'
  return raw
}

const computeTotals = (session: FuelingSession, unitPrice: number) => {
  const volume = computeDispensedVolume(session)
  const rawAmount = computeDispensedAmount(session)
  const amount = rawAmount != null ? rawAmount : volume * unitPrice
  const roundedAmount = Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0
  return { volume, amount: roundedAmount }
}

const deterministicUuid = (input: string) => {
  const hash = createHash('sha1').update(input).digest()
  const bytes = Array.from(hash.slice(0, 16))
  // Set version 5 and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Buffer.from(bytes).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const resolveSessionTransactionDateTime = (session: FuelingSession) => {
  const timestamp =
    session.completionCandidateAt ?? session.lastUpdateAt ?? session.startedAt
  return Number.isFinite(timestamp) ? new Date(timestamp) : new Date()
}

const createTransactionForSession = async (session: FuelingSession) => {
  if (session.finalized) return

  const sessionKey = `forecourt:${session.stationId}:${session.pumpNumber}:${session.nozzleNumber}:${session.startedAt}`
  const sourceQueueId = deterministicUuid(sessionKey)

  const insertedId = await withTransaction(async (client) => {
    const nozzleRow = await txQuery<{
      pump_id: string
      nozzle_id: string
      tank_id: string
      nozzle_number: number | null
      product_row_id: string
      product_id: string
      product_name: string | null
      product_code: string | null
      unit_price: number | null
      currency: string | null
      tax_rate: number | null
      tax_code: string | null
      created_by_name: string | null
    }>(
      client,
      `SELECT p.id AS pump_id,
              n.id AS nozzle_id,
              t.id AS tank_id,
              n.nozzle_number,
              pr.id as product_row_id,
              pr.product_id,
              pr.product_name,
              pr.product_code,
              pr.unit_price,
              COALESCE(pr.currency, NULLIF($4, '')) as currency,
              COALESCE(pr.tax_rate, 0.16) as tax_rate,
              COALESCE(pr.ext_tax_code, pr.tax_code) as tax_code,
              COALESCE(pr.created_by_name, 'system') as created_by_name
         FROM pumps p
         JOIN nozzles n ON n.pump_id = p.id AND n.station_id = p.station_id
         JOIN tanks t ON t.id = n.tank_id AND t.station_id = n.station_id
         JOIN products pr ON pr.id = t.product_id AND pr.station_id = t.station_id
        WHERE p.station_id = $1
          AND p.pump_number = $2
          AND p.status <> 'INACTIVE'
          AND n.is_active = TRUE
          AND n.nozzle_number = $3
        LIMIT 1`,
      [
        session.stationId,
        session.pumpNumber,
        session.nozzleNumber,
        process.env.DEFAULT_CURRENCY?.trim() || 'USD',
      ],
    )

    if (!nozzleRow?.rows?.[0]) return null
    const nozzle = nozzleRow.rows[0]

    const priceSlice = await txQuery<{
      id: string
      unit_price: number
    }>(
      client,
      `SELECT id, unit_price
         FROM product_price_slices
        WHERE station_id = $1
          AND product_id = $2
          AND effective_to IS NULL
        ORDER BY effective_from DESC
        LIMIT 1`,
      [session.stationId, nozzle.product_id],
    )

    let slice = priceSlice.rows[0]
    if (!slice) {
      const baseUnitPrice = Number(nozzle.unit_price ?? NaN)
      if (!Number.isFinite(baseUnitPrice)) return null
      const currency =
        nozzle.currency || process.env.DEFAULT_CURRENCY?.trim() || 'USD'
      const taxRate = Number.isFinite(Number(nozzle.tax_rate))
        ? Number(nozzle.tax_rate)
        : 16
      const createdBy = nozzle.created_by_name || 'system'
      const created = await txQuery<{ id: string; unit_price: number }>(
        client,
        `INSERT INTO product_price_slices (
          id,
          station_id,
          product_id,
          unit_price,
          currency,
          tax_rate,
          created_by_name,
          effective_from
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, unit_price`,
        [
          uuidv4(),
          session.stationId,
          nozzle.product_id,
          baseUnitPrice,
          currency,
          taxRate,
          createdBy,
        ],
      )
      slice = created.rows[0]
      if (!slice) return null
    }

    const unitPrice = Number(slice.unit_price)
    if (!Number.isFinite(unitPrice)) return null

    const totals = computeTotals(session, unitPrice)
    if (!Number.isFinite(totals.volume) || totals.volume <= 0) return null
    const transactionDateTime = resolveSessionTransactionDateTime(session)

    const linkingWindowSeconds = await getStationLinkingWindowSecondsTx(
      client,
      session.stationId,
    )
    const correlationSeconds =
      normalizeForecourtTransactionCorrelationSeconds(linkingWindowSeconds)
    const correlationLockKey = buildForecourtTransactionCorrelationLockKey({
      stationId: session.stationId,
      pumpNumber: session.pumpNumber,
      nozzleNumber: session.nozzleNumber,
    })

    // Serialize the pump-session and JPL-buffer creation paths so whichever
    // observes the physical sale first becomes the single canonical row.
    await txQuery(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      correlationLockKey,
    ])
    await txQuery(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      sourceQueueId,
    ])

    const existing = await txQuery<{ id: string }>(
      client,
      `SELECT id FROM transactions WHERE station_id = $1 AND source_queue_id = $2 LIMIT 1`,
      [session.stationId, sourceQueueId],
    )

    const existingId = existing.rows[0]?.id
    if (existingId) {
      return existingId
    }

    const existingJpl = await txQuery<{ id: string }>(
      client,
      `SELECT id
         FROM transactions
        WHERE station_id = $1::uuid
          AND pump_number = $2::int
          AND deleted_at IS NULL
          AND doms_source_system = 'jpl'
          AND doms_transaction_identity IS NOT NULL
          AND (nozzle_number = $3::int OR nozzle_number IS NULL)
          AND ABS(total_amount - $4::numeric) <= 0.01
          AND ABS(volume - $5::numeric) <= 0.001
          AND ABS(EXTRACT(EPOCH FROM (transaction_date_time - $6::timestamptz))) <= $7::int
        ORDER BY ABS(EXTRACT(EPOCH FROM (transaction_date_time - $6::timestamptz))) ASC,
                 transaction_date_time DESC
        LIMIT 1
        FOR UPDATE`,
      [
        session.stationId,
        session.pumpNumber,
        session.nozzleNumber,
        totals.amount,
        totals.volume,
        transactionDateTime,
        correlationSeconds,
      ],
    )

    const existingJplId = existingJpl.rows[0]?.id ?? null
    if (existingJplId) {
      await txQuery(
        client,
        `UPDATE transactions
            SET source_queue_id = COALESCE(source_queue_id, $3::uuid),
                tank_id = COALESCE(tank_id, $4::uuid),
                nozzle_id = COALESCE(nozzle_id, $5::uuid),
                nozzle_number = COALESCE(nozzle_number, $6::int),
                grade_id = COALESCE(grade_id, $7),
                grade_name = COALESCE(grade_name, $8),
                updated_at = NOW()
          WHERE station_id = $1::uuid
            AND id = $2::uuid`,
        [
          session.stationId,
          existingJplId,
          sourceQueueId,
          nozzle.tank_id,
          nozzle.nozzle_id,
          nozzle.nozzle_number,
          nozzle.product_id ?? nozzle.product_code ?? null,
          nozzle.product_name ?? nozzle.product_code ?? null,
        ],
      )

      await txQuery(
        client,
        `INSERT INTO transaction_lines (
          id,
          transaction_id,
          product_id,
          quantity,
          unit_price,
          tax_code,
          tax_rate,
          price_slice_id
        )
        SELECT $1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::uuid
         WHERE NOT EXISTS (
           SELECT 1 FROM transaction_lines WHERE transaction_id = $2::uuid
         )
           AND EXISTS (
             SELECT 1
               FROM transactions
              WHERE id = $2::uuid
                AND status NOT IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED')
           )`,
        [
          uuidv4(),
          existingJplId,
          nozzle.product_row_id,
          totals.volume,
          unitPrice,
          nozzle.tax_code,
          nozzle.tax_rate,
          slice.id,
        ],
      )

      return existingJplId
    }

    const transactionId = uuidv4()
    const transactionInsert = await txQuery<{ id: string }>(
      client,
      `INSERT INTO transactions (
        id,
        station_id,
        pump_number,
        transaction_date_time,
        total_amount,
        volume,
        fuel_type,
        status,
        pos_reference,
        source_queue_id,
        linking_window_expires_at,
        tank_id,
        nozzle_id,
        nozzle_number,
        grade_id,
        grade_name
      )
      VALUES (
        $1,
        $2,
        $3,
        $4::timestamptz,
        $5,
        $6,
        $7,
        'OPEN',
        $8,
        $9,
        CASE
          WHEN $10::int IS NULL THEN NULL
          ELSE $4::timestamptz + ($10::int * INTERVAL '1 second')
        END,
        $11,
        $12,
        $13,
        $14,
        $15
      )
      RETURNING id`,
      [
        transactionId,
        session.stationId,
        session.pumpNumber,
        transactionDateTime,
        totals.amount,
        totals.volume,
        nozzle.product_name ?? nozzle.product_code ?? null,
        sessionKey,
        sourceQueueId,
        linkingWindowSeconds,
        nozzle.tank_id,
        nozzle.nozzle_id,
        nozzle.nozzle_number,
        nozzle.product_id ?? nozzle.product_code ?? null,
        nozzle.product_name ?? nozzle.product_code ?? null,
      ],
    )

    const insertedId = transactionInsert.rows[0]?.id
    if (!insertedId) return null

    await txQuery(
      client,
      `INSERT INTO transaction_lines (
        id,
        transaction_id,
        product_id,
        quantity,
        unit_price,
        tax_code,
        tax_rate,
        price_slice_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        uuidv4(),
        transactionId,
        nozzle.product_row_id,
        totals.volume,
        unitPrice,
        nozzle.tax_code,
        nozzle.tax_rate,
        slice.id,
      ],
    )

    await enqueueFiscalInboxMessage({
      stationId: session.stationId,
      topic: 'pos',
      requestId: `tin:${transactionId}`,
      message: {
        type: 'tinCaptureRequest',
        stationId: session.stationId,
        transactionId,
        pumpNumber: session.pumpNumber,
        nozzleNumber: session.nozzleNumber,
        volume: totals.volume,
        amount: totals.amount,
        status: 'OPEN',
        at: Date.now(),
      },
    }).catch((err) => {
      logger.error('[pump-store]', {
        msg: 'Failed to enqueue TIN capture notification',
        error: err,
      })
    })

    await enqueueFiscalInboxMessage({
      stationId: session.stationId,
      topic: 'fiscal',
      requestId: `txn-created:${transactionId}`,
      message: {
        type: 'transactionCreated',
        stationId: session.stationId,
        transactionId,
        pumpNumber: session.pumpNumber,
        nozzleNumber: session.nozzleNumber,
        volume: totals.volume,
        amount: totals.amount,
        status: 'OPEN',
        at: Date.now(),
      },
    }).catch((err) => {
      logger.error('[pump-store]', {
        msg: 'Failed to enqueue transaction created notification',
        error: err,
      })
    })

    return transactionId
  })

  if (insertedId) {
    await syncDeductionForTransaction(session.stationId, insertedId).catch(
      (err) => {
        logger.error('[pump-store]', {
          msg: 'Failed to sync tank deduction for created fuel transaction',
          error: err,
          transactionId: insertedId,
        })
      },
    )
    await ensureTanzaniaTransactionTankProjection({
      stationId: session.stationId,
      transactionId: insertedId,
    }).catch((err) => {
      logger.error('[pump-store]', {
        msg: 'Failed to capture Tanzania transaction tank projection',
        error: err,
        transactionId: insertedId,
      })
    })
    session.finalized = true
  }
}

const resolveNozzleNumberForEvent = async (opts: {
  stationId: string
  pumpNumber: number
  nozzleId: string
}) => {
  const numeric = parseNumber(opts.nozzleId)
  if (numeric != null) return numeric
  return await resolveNozzleNumber(opts)
}

export async function handlePumpStateChange(snapshot: PumpStateSnapshot) {
  if (!snapshot?.stationId || !Array.isArray(snapshot.pumps)) return

  for (const pump of snapshot.pumps) {
    const pumpNumber = parseNumber(pump?.pumpId)
    if (!pumpNumber || !Array.isArray(pump.nozzles)) continue

    for (const nozzle of pump.nozzles) {
      if (!nozzle?.nozzleId) continue
      const nozzleNumber = await resolveNozzleNumberForEvent({
        stationId: snapshot.stationId,
        pumpNumber,
        nozzleId: nozzle.nozzleId,
      })
      if (!nozzleNumber) continue

      const normalizedState = normalizeFuelingState(nozzle.state)
      const { session, transition } = updateFuelingFromState({
        stationId: snapshot.stationId,
        pumpNumber,
        nozzleNumber,
        state: normalizedState,
      })

      if (transition === 'end' && session && !session.finalized) {
        await createTransactionForSession(session)
      }
    }
  }
}

export async function handlePumpEventMessage(msg: any) {
  if (!msg || typeof msg !== 'object') return

  const stationId = String(msg.stationId ?? msg.station_id ?? '')
  if (!stationId) return

  const pumpNumber = parseNumber(msg.pumpId ?? msg.pump_id)
  if (!pumpNumber) return

  const nozzleId = String(msg.nozzleId ?? msg.nozzle_id ?? '')
  if (!nozzleId) return

  const nozzleNumber = await resolveNozzleNumberForEvent({
    stationId,
    pumpNumber,
    nozzleId,
  })
  if (!nozzleNumber) return

  const volume = msg.volume != null ? parseFloat(String(msg.volume)) : undefined
  const amount = msg.amount ?? msg.totalAmount ?? msg.total_amount
  const parsedAmount = amount != null ? parseFloat(String(amount)) : undefined
  const rawState = String(msg.state ?? msg.status ?? '').toLowerCase()
  const rawType = String(msg.type ?? msg.event ?? '').toLowerCase()
  const state =
    rawState ||
    (rawType === 'transaction' || rawType === 'sale' ? 'end' : rawType)

  const metricUpdate = updateFuelingMetrics({
    stationId,
    pumpNumber,
    nozzleNumber,
    volume: Number.isFinite(volume) ? volume : undefined,
    amount: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
  })

  const { session, transition } = updateFuelingFromState({
    stationId,
    pumpNumber,
    nozzleNumber,
    state,
    volume: Number.isFinite(volume) ? volume : undefined,
    amount: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
  })

  const target =
    session ??
    metricUpdate ??
    getFuelingSession(stationId, pumpNumber, nozzleNumber)

  // If this is a totals snapshot emitted by polling, mark that we saw post-sale totals
  if (target && (rawType === 'totals_snapshot' || rawType === 'transaction')) {
    notePostSaleTotalsSeen(target, Date.now())
  }

  if (target && !target.finalized) {
    const finalizeCfg = {
      stableIdleMs: 5000,
      stableIdleFallbackMs: 8000,
      postSaleTotalsWaitMs: 3000,
    }

    // Start totals polling when dispensing begins
    if (transition === 'start') {
      startSaleTotalsPolling(
        { salePollingIntervalMs: 1000, postSaleTotalsWaitMs: 3000 },
        { stationId, pumpNumber, nozzleNumber },
      )
      clearFuelingCompletionCandidate(target)
    }

    // Completion candidate when transition ends or we are idle after dispensing
    const shouldCreateCandidate =
      transition === 'end' || target.status === 'idle'
    if (shouldCreateCandidate) {
      markFuelingCompletionCandidate(target, Date.now())
      // Best-effort post-sale totals refresh; if the adapter doesn't support it, we will fall back to stability-only finalize
      requestPostSaleTotalsRefresh(
        { salePollingIntervalMs: 1000, postSaleTotalsWaitMs: 3000 },
        { stationId, pumpNumber, nozzleNumber },
      ).catch(() => {})
    }

    // Only finalize once we are stable idle and have dispensed something
    if (
      isFuelingReadyToFinalize(target, finalizeCfg) &&
      computeDispensedVolume(target) > 0
    ) {
      stopTotalsPolling({ stationId, pumpNumber, nozzleNumber })
      await createTransactionForSession(target)
      // after successful creation, session is marked finalized by createTransactionForSession
    }
  }
}

export function cleanupStalePendingAuths() {
  cleanupFuelingSessions()
}
