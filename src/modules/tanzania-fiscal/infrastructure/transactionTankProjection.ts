import type { PoolClient } from '@/src/platform/db/postgres'
import type { ProxyInvoiceRequest } from '@/src/shared/fiscalization/proxy/contracts'
import type { TankConfig } from '@/src/shared/setup/tanksConfig'

import { txQuery, withTransaction } from '@/src/platform/db/postgres'
import { KV_KEYS, normalizeTankConfig } from '@/src/shared/setup/tanksConfig'

import { getStationCountryCode, isTanzaniaCountry } from './country'

export type TanzaniaTankProjectionScope = 'GROUP' | 'ACTIVE_TANK'

export type TanzaniaTransactionTankProjection = {
  stationId: string
  transactionId: string
  productId: string
  scopeType: TanzaniaTankProjectionScope
  scopeKey: string
  sourceTankId: string
  sourceDomsTankId: string | null
  tankGroupId: string | null
  representativeTankId: string
  representativeDomsTankId: string
  atgCapturedAt: string
  baselineVolumeLitres: number
  priorSalesVolumeLitres: number
  transactionVolumeLitres: number
  reportedVolumeLitres: number
  memberTankIds: string[]
  memberDomsTankIds: string[]
}

type ProjectionRow = {
  station_id: string
  transaction_id: string
  product_id: string
  scope_type: TanzaniaTankProjectionScope
  scope_key: string
  source_tank_id: string
  source_doms_tank_id: string | null
  tank_group_id: string | null
  representative_tank_id: string
  representative_doms_tank_id: string
  atg_captured_at: string | Date
  baseline_volume_litres: string | number
  prior_sales_volume_litres: string | number
  transaction_volume_litres: string | number
  reported_volume_litres: string | number
  member_tank_ids: string[] | null
  member_doms_tank_ids: string[] | null
}

type TransactionContext = {
  id: string
  transaction_date_time: string | Date
  created_at: string | Date
  volume: string | number | null
  fuel_type: string | null
  grade_name: string | null
  source_tank_id: string
  source_tank_group_id: string | null
  source_doms_tank_id: string | null
  source_tank_code: string | null
  product_id: string
  product_name: string | null
  product_code: string | null
  ext_product_code: string | null
  ext_description: string | null
}

type TankRow = {
  id: string
  product_id: string
  tank_group_id: string | null
  doms_tank_id: string | null
  code: string | null
  name: string | null
}

type SnapshotRow = {
  tank_id: string
  captured_at: string | Date
  volume_litres: string | number | null
  doms_tank_id: string | null
}

type SnapshotBaseline = {
  atgCapturedAt: string
  baselineVolumeLitres: number
  memberDomsTankIds: string[]
}

type ReusableBaselineRow = {
  atg_captured_at: string | Date
  baseline_volume_litres: string | number
  member_doms_tank_ids: string[] | null
}

const roundVolume = (value: number) => Number(value.toFixed(3))

const normalizedGrade = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()

export function normalizeTanzaniaTankId(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (/^\d+$/.test(text)) return String(Number(text))
  return text
}

export function calculateTanzaniaReportedTankVolume(args: {
  baselineVolumeLitres: number
  priorSalesVolumeLitres: number
  transactionVolumeLitres: number
}): number {
  const baseline = Number(args.baselineVolumeLitres)
  const prior = Number(args.priorSalesVolumeLitres)
  const transaction = Number(args.transactionVolumeLitres)
  if (![baseline, prior, transaction].every(Number.isFinite)) {
    throw new Error('Tanzania tank projection requires finite litre values')
  }
  if (baseline < 0 || prior < 0 || transaction <= 0) {
    throw new Error('Tanzania tank projection litre values are invalid')
  }

  const remaining = roundVolume(baseline - prior - transaction)
  if (remaining < -0.001) {
    throw new Error(
      `Tanzania projected tank inventory would be negative (${remaining.toFixed(3)} L). Refresh ATG data and verify tank/group mapping before fiscalization.`,
    )
  }
  return Math.max(0, remaining)
}

export function applyTanzaniaTankProjectionToInvoice(
  invoice: ProxyInvoiceRequest,
  projection: TanzaniaTransactionTankProjection,
): ProxyInvoiceRequest {
  return {
    ...invoice,
    lines: (invoice.lines ?? []).map((line) => {
      if (!line.product?.fuel) return line
      return {
        ...line,
        product: {
          ...line.product,
          fuel: {
            ...line.product.fuel,
            tankId: projection.representativeDomsTankId,
            tankVolume: projection.reportedVolumeLitres,
          },
        },
      }
    }),
  }
}

function toProjection(row: ProjectionRow): TanzaniaTransactionTankProjection {
  return {
    stationId: row.station_id,
    transactionId: row.transaction_id,
    productId: row.product_id,
    scopeType: row.scope_type,
    scopeKey: row.scope_key,
    sourceTankId: row.source_tank_id,
    sourceDomsTankId: row.source_doms_tank_id,
    tankGroupId: row.tank_group_id,
    representativeTankId: row.representative_tank_id,
    representativeDomsTankId: row.representative_doms_tank_id,
    atgCapturedAt: new Date(row.atg_captured_at).toISOString(),
    baselineVolumeLitres: Number(row.baseline_volume_litres),
    priorSalesVolumeLitres: Number(row.prior_sales_volume_litres),
    transactionVolumeLitres: Number(row.transaction_volume_litres),
    reportedVolumeLitres: Number(row.reported_volume_litres),
    memberTankIds: row.member_tank_ids ?? [],
    memberDomsTankIds: row.member_doms_tank_ids ?? [],
  }
}

async function loadProjection(
  client: PoolClient,
  stationId: string,
  transactionId: string,
): Promise<ProjectionRow | null> {
  const result = await txQuery<ProjectionRow>(
    client,
    `SELECT station_id,
            transaction_id,
            product_id,
            scope_type,
            scope_key,
            source_tank_id,
            source_doms_tank_id,
            tank_group_id,
            representative_tank_id,
            representative_doms_tank_id,
            atg_captured_at,
            baseline_volume_litres,
            prior_sales_volume_litres,
            transaction_volume_litres,
            reported_volume_litres,
            member_tank_ids,
            member_doms_tank_ids
       FROM tanzania_transaction_tank_projections
      WHERE station_id = $1::uuid
        AND transaction_id = $2::uuid
      LIMIT 1`,
    [stationId, transactionId],
  )
  return result.rows[0] ?? null
}

async function loadTransactionContext(
  client: PoolClient,
  stationId: string,
  transactionId: string,
): Promise<TransactionContext> {
  const result = await txQuery<TransactionContext>(
    client,
    `SELECT t.id::text,
            t.transaction_date_time,
            t.created_at,
            t.volume,
            t.fuel_type,
            t.grade_name,
            source_tank.id::text AS source_tank_id,
            source_tank.tank_group_id::text AS source_tank_group_id,
            source_tank.doms_tank_id AS source_doms_tank_id,
            source_tank.code AS source_tank_code,
            source_tank.product_id::text AS product_id,
            p.product_name,
            p.product_code,
            p.ext_product_code,
            p.ext_description
       FROM transactions t
       LEFT JOIN nozzles nozzle_by_id
         ON nozzle_by_id.station_id = t.station_id
        AND nozzle_by_id.id = t.nozzle_id
       LEFT JOIN pumps pump_by_number
         ON pump_by_number.station_id = t.station_id
        AND pump_by_number.pump_number = t.pump_number
       LEFT JOIN nozzles nozzle_by_number
         ON nozzle_by_number.station_id = t.station_id
        AND nozzle_by_number.pump_id = pump_by_number.id
        AND nozzle_by_number.nozzle_number = t.nozzle_number
        AND nozzle_by_number.is_active = TRUE
       JOIN tanks source_tank
         ON source_tank.station_id = t.station_id
        AND source_tank.id = COALESCE(
              t.tank_id,
              nozzle_by_id.tank_id,
              nozzle_by_number.tank_id
            )
       JOIN products p
         ON p.station_id = source_tank.station_id
        AND p.id = source_tank.product_id
      WHERE t.station_id = $1::uuid
        AND t.id = $2::uuid
        AND t.deleted_at IS NULL
      LIMIT 1`,
    [stationId, transactionId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new Error(
      'Tanzania transaction tank projection requires an exact transaction tank/nozzle mapping.',
    )
  }
  return row
}

async function loadTankConfig(
  client: PoolClient,
  stationId: string,
): Promise<TankConfig> {
  const result = await txQuery<{ value: unknown }>(
    client,
    `SELECT value
       FROM station_kv
      WHERE station_id = $1::uuid
        AND key = $2
      LIMIT 1`,
    [stationId, KV_KEYS.TANKS_CONFIG],
  )
  const raw = result.rows[0]?.value
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      'Tanzania transaction tank projection requires tanks.config with an active tank for each fuel grade.',
    )
  }
  return normalizeTankConfig(raw as Partial<TankConfig>)
}

async function listProductTanks(
  client: PoolClient,
  stationId: string,
  productId: string,
): Promise<TankRow[]> {
  const result = await txQuery<TankRow>(
    client,
    `SELECT id::text,
            product_id::text,
            tank_group_id::text,
            doms_tank_id,
            code,
            name
       FROM tanks
      WHERE station_id = $1::uuid
        AND product_id = $2::uuid
        AND status = 'ACTIVE'
      ORDER BY CASE
                 WHEN COALESCE(doms_tank_id, code, '') ~ '^\\d+$'
                   THEN COALESCE(doms_tank_id, code)::integer
                 ELSE 2147483647
               END,
               COALESCE(doms_tank_id, code, ''),
               id`,
    [stationId, productId],
  )
  return result.rows
}

function resolveActiveTank(args: {
  config: TankConfig
  context: TransactionContext
  tanks: TankRow[]
}): TankRow {
  const aliases = new Set(
    [
      args.context.product_name,
      args.context.product_code,
      args.context.ext_product_code,
      args.context.ext_description,
      args.context.fuel_type,
      args.context.grade_name,
    ]
      .map(normalizedGrade)
      .filter(Boolean),
  )

  const activeIndexes = args.config.tanks
    .map((grade, index) => ({ grade: normalizedGrade(grade), index }))
    .filter(
      ({ grade, index }) =>
        Boolean(args.config.activeTanks[index]) && aliases.has(grade),
    )
    .map(({ index }) => index)

  if (activeIndexes.length !== 1) {
    throw new Error(
      `Tanzania fuel grade ${args.context.product_name || args.context.grade_name || args.context.product_code || args.context.product_id} must have exactly one active tank in tanks.config.`,
    )
  }

  const expectedTankId = String(activeIndexes[0] + 1)
  const activeTank = args.tanks.find((tank) => {
    const configuredId = normalizeTanzaniaTankId(tank.doms_tank_id ?? tank.code)
    return configuredId === expectedTankId
  })

  if (!activeTank) {
    throw new Error(
      `Active Tanzania tank ${expectedTankId} for grade ${args.context.product_name || args.context.grade_name || args.context.product_id} is not mapped to an ACTIVE relational tank with the same product.`,
    )
  }
  return activeTank
}

async function loadSnapshotBaseline(args: {
  client: PoolClient
  stationId: string
  memberTanks: TankRow[]
  transactionDate: Date
}): Promise<SnapshotBaseline | null> {
  const memberIds = args.memberTanks.map((tank) => tank.id)
  const result = await txQuery<SnapshotRow>(
    args.client,
    `WITH eligible_capture AS (
       SELECT captured_at
         FROM tank_atg_capture_evidence
        WHERE station_id = $1::uuid
          AND tank_id = ANY($2::uuid[])
          AND captured_at <= $3::timestamptz
        GROUP BY captured_at
       HAVING COUNT(DISTINCT tank_id) = cardinality($2::uuid[])
        ORDER BY captured_at DESC
        LIMIT 1
     )
     SELECT evidence.tank_id::text,
            evidence.captured_at,
            evidence.volume_litres,
            evidence.doms_tank_id
       FROM tank_atg_capture_evidence evidence
       JOIN eligible_capture capture
         ON capture.captured_at = evidence.captured_at
      WHERE evidence.station_id = $1::uuid
        AND evidence.tank_id = ANY($2::uuid[])
      ORDER BY evidence.tank_id`,
    [args.stationId, memberIds, args.transactionDate],
  )
  if (!result.rows.length) return null

  if (result.rows.length !== memberIds.length) {
    throw new Error(
      'Tanzania transaction tank projection requires a complete historical ATG capture for every tank in the selected reporting scope.',
    )
  }

  const byTank = new Map(result.rows.map((row) => [row.tank_id, row]))
  const ordered = memberIds
    .map((id) => byTank.get(id))
    .filter(Boolean) as SnapshotRow[]
  const capturedTimes = Array.from(
    new Set(ordered.map((row) => new Date(row.captured_at).toISOString())),
  )
  if (capturedTimes.length !== 1) {
    throw new Error(
      'Tanzania grouped tank projection requires all member tanks to come from the same complete ATG capture.',
    )
  }

  const atgCapturedAt = new Date(capturedTimes[0])
  if (atgCapturedAt.getTime() > args.transactionDate.getTime()) {
    throw new Error(
      'FTC selected an invalid Tanzania ATG capture newer than the transaction.',
    )
  }

  const baseline = ordered.reduce((sum, row) => {
    const value = Number(row.volume_litres)
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `Tanzania ATG volume is missing or invalid for tank ${row.tank_id}.`,
      )
    }
    return sum + value
  }, 0)

  return {
    atgCapturedAt: atgCapturedAt.toISOString(),
    baselineVolumeLitres: roundVolume(baseline),
    memberDomsTankIds: args.memberTanks.map((tank) => {
      const id = normalizeTanzaniaTankId(tank.doms_tank_id ?? tank.code)
      if (!id) {
        throw new Error(
          `Tanzania tank ${tank.name || tank.id} is missing a DOMS/regulatory Tank_ID.`,
        )
      }
      return id
    }),
  }
}

async function loadReusableProjectionBaseline(args: {
  client: PoolClient
  stationId: string
  transactionId: string
  productId: string
  scopeType: TanzaniaTankProjectionScope
  scopeKey: string
  representativeTankId: string
  memberTanks: TankRow[]
  transactionDate: string | Date
  transactionCreatedAt: string | Date
}): Promise<SnapshotBaseline | null> {
  const memberIds = args.memberTanks.map((tank) => tank.id)
  const result = await txQuery<ReusableBaselineRow>(
    args.client,
    `SELECT projection.atg_captured_at,
            projection.baseline_volume_litres,
            projection.member_doms_tank_ids
       FROM tanzania_transaction_tank_projections projection
       JOIN transactions prior_transaction
         ON prior_transaction.station_id = projection.station_id
        AND prior_transaction.id = projection.transaction_id
      WHERE projection.station_id = $1::uuid
        AND projection.transaction_id <> $2::uuid
        AND projection.product_id = $3::uuid
        AND projection.scope_type = $4
        AND projection.scope_key = $5
        AND projection.representative_tank_id = $6::uuid
        AND projection.member_tank_ids @> $7::uuid[]
        AND projection.member_tank_ids <@ $7::uuid[]
        AND projection.atg_captured_at <= $8::timestamptz
        AND (
          prior_transaction.transaction_date_time < $8::timestamptz
          OR (
            prior_transaction.transaction_date_time = $8::timestamptz
            AND (
              prior_transaction.created_at < $9::timestamptz
              OR (
                prior_transaction.created_at = $9::timestamptz
                AND prior_transaction.id::text < $2::text
              )
            )
          )
        )
      ORDER BY projection.atg_captured_at DESC,
               prior_transaction.transaction_date_time DESC,
               prior_transaction.created_at DESC,
               prior_transaction.id DESC
      LIMIT 1`,
    [
      args.stationId,
      args.transactionId,
      args.productId,
      args.scopeType,
      args.scopeKey,
      args.representativeTankId,
      memberIds,
      args.transactionDate,
      args.transactionCreatedAt,
    ],
  )
  const row = result.rows[0]
  if (!row) return null

  const memberDomsTankIds = row.member_doms_tank_ids ?? []
  if (memberDomsTankIds.length !== memberIds.length) return null

  const baselineVolumeLitres = Number(row.baseline_volume_litres)
  if (!Number.isFinite(baselineVolumeLitres) || baselineVolumeLitres < 0) {
    return null
  }

  return {
    atgCapturedAt: new Date(row.atg_captured_at).toISOString(),
    baselineVolumeLitres: roundVolume(baselineVolumeLitres),
    memberDomsTankIds,
  }
}

async function calculatePriorSales(args: {
  client: PoolClient
  stationId: string
  transactionId: string
  productId: string
  tankGroupId: string | null
  atgCapturedAt: string
  transactionDate: string | Date
  transactionCreatedAt: string | Date
}): Promise<number> {
  const result = await txQuery<{ prior_volume: string | number | null }>(
    args.client,
    `SELECT COALESCE(SUM(COALESCE(t.volume, 0)), 0)::numeric AS prior_volume
       FROM transactions t
       LEFT JOIN nozzles nozzle_by_id
         ON nozzle_by_id.station_id = t.station_id
        AND nozzle_by_id.id = t.nozzle_id
       LEFT JOIN pumps pump_by_number
         ON pump_by_number.station_id = t.station_id
        AND pump_by_number.pump_number = t.pump_number
       LEFT JOIN nozzles nozzle_by_number
         ON nozzle_by_number.station_id = t.station_id
        AND nozzle_by_number.pump_id = pump_by_number.id
        AND nozzle_by_number.nozzle_number = t.nozzle_number
        AND nozzle_by_number.is_active = TRUE
       JOIN tanks source_tank
         ON source_tank.station_id = t.station_id
        AND source_tank.id = COALESCE(
              t.tank_id,
              nozzle_by_id.tank_id,
              nozzle_by_number.tank_id
            )
      WHERE t.station_id = $1::uuid
        AND t.id <> $2::uuid
        AND t.deleted_at IS NULL
        AND t.status <> 'CREDITED'
        AND COALESCE(t.volume, 0) > 0
        AND source_tank.product_id = $3::uuid
        AND source_tank.status = 'ACTIVE'
        AND t.transaction_date_time >= $4::timestamptz
        AND (
          t.transaction_date_time < $5::timestamptz
          OR (
            t.transaction_date_time = $5::timestamptz
            AND (
              t.created_at < $6::timestamptz
              OR (t.created_at = $6::timestamptz AND t.id::text < $2::text)
            )
          )
        )
        AND (
          ($7::uuid IS NOT NULL AND source_tank.tank_group_id = $7::uuid)
          OR ($7::uuid IS NULL AND source_tank.tank_group_id IS NULL)
        )`,
    [
      args.stationId,
      args.transactionId,
      args.productId,
      args.atgCapturedAt,
      args.transactionDate,
      args.transactionCreatedAt,
      args.tankGroupId,
    ],
  )
  return roundVolume(Number(result.rows[0]?.prior_volume ?? 0))
}

async function persistProjection(args: {
  client: PoolClient
  projection: TanzaniaTransactionTankProjection
}): Promise<TanzaniaTransactionTankProjection> {
  const p = args.projection
  const result = await txQuery<ProjectionRow>(
    args.client,
    `INSERT INTO tanzania_transaction_tank_projections (
       station_id,
       transaction_id,
       product_id,
       scope_type,
       scope_key,
       source_tank_id,
       source_doms_tank_id,
       tank_group_id,
       representative_tank_id,
       representative_doms_tank_id,
       atg_captured_at,
       baseline_volume_litres,
       prior_sales_volume_litres,
       transaction_volume_litres,
       reported_volume_litres,
       member_tank_ids,
       member_doms_tank_ids
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid, $7,
       $8::uuid, $9::uuid, $10, $11::timestamptz, $12, $13, $14, $15,
       $16::uuid[], $17::text[]
     )
     ON CONFLICT (station_id, transaction_id)
     DO UPDATE SET prior_sales_volume_litres = EXCLUDED.prior_sales_volume_litres,
                   transaction_volume_litres = EXCLUDED.transaction_volume_litres,
                   reported_volume_litres = EXCLUDED.reported_volume_litres,
                   updated_at = NOW()
     RETURNING station_id,
               transaction_id,
               product_id,
               scope_type,
               scope_key,
               source_tank_id,
               source_doms_tank_id,
               tank_group_id,
               representative_tank_id,
               representative_doms_tank_id,
               atg_captured_at,
               baseline_volume_litres,
               prior_sales_volume_litres,
               transaction_volume_litres,
               reported_volume_litres,
               member_tank_ids,
               member_doms_tank_ids`,
    [
      p.stationId,
      p.transactionId,
      p.productId,
      p.scopeType,
      p.scopeKey,
      p.sourceTankId,
      p.sourceDomsTankId,
      p.tankGroupId,
      p.representativeTankId,
      p.representativeDomsTankId,
      p.atgCapturedAt,
      p.baselineVolumeLitres,
      p.priorSalesVolumeLitres,
      p.transactionVolumeLitres,
      p.reportedVolumeLitres,
      p.memberTankIds,
      p.memberDomsTankIds,
    ],
  )
  return toProjection(result.rows[0])
}

export async function ensureTanzaniaTransactionTankProjection(args: {
  stationId: string
  transactionId: string
}): Promise<TanzaniaTransactionTankProjection | null> {
  const country = await getStationCountryCode(args.stationId)
  if (!isTanzaniaCountry(country)) return null

  return await withTransaction(async (client) => {
    await txQuery(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `tanzania-tank-projection:${args.stationId}:${args.transactionId}`,
    ])

    const context = await loadTransactionContext(
      client,
      args.stationId,
      args.transactionId,
    )
    const transactionVolume = roundVolume(Number(context.volume ?? 0))
    if (!Number.isFinite(transactionVolume) || transactionVolume <= 0) {
      return null
    }

    const existing = await loadProjection(
      client,
      args.stationId,
      args.transactionId,
    )

    if (existing) {
      await txQuery(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `tanzania-tank-scope:${args.stationId}:${existing.scope_key}`,
      ])
      const priorSalesVolumeLitres = await calculatePriorSales({
        client,
        stationId: args.stationId,
        transactionId: args.transactionId,
        productId: existing.product_id,
        tankGroupId: existing.tank_group_id,
        atgCapturedAt: new Date(existing.atg_captured_at).toISOString(),
        transactionDate: context.transaction_date_time,
        transactionCreatedAt: context.created_at,
      })
      const reportedVolumeLitres = calculateTanzaniaReportedTankVolume({
        baselineVolumeLitres: Number(existing.baseline_volume_litres),
        priorSalesVolumeLitres,
        transactionVolumeLitres: transactionVolume,
      })
      return await persistProjection({
        client,
        projection: {
          ...toProjection(existing),
          priorSalesVolumeLitres,
          transactionVolumeLitres: transactionVolume,
          reportedVolumeLitres,
        },
      })
    }

    const config = await loadTankConfig(client, args.stationId)
    const productTanks = await listProductTanks(
      client,
      args.stationId,
      context.product_id,
    )
    const activeTank = resolveActiveTank({
      config,
      context,
      tanks: productTanks,
    })

    const sourceTank = productTanks.find(
      (tank) => tank.id === context.source_tank_id,
    )
    if (!sourceTank) {
      throw new Error(
        'The transaction source tank is not ACTIVE or does not match the transaction fuel product.',
      )
    }

    let scopeType: TanzaniaTankProjectionScope
    let tankGroupId: string | null
    let memberTanks: TankRow[]
    if (sourceTank.tank_group_id) {
      scopeType = 'GROUP'
      tankGroupId = sourceTank.tank_group_id
      memberTanks = productTanks.filter(
        (tank) => tank.tank_group_id === sourceTank.tank_group_id,
      )
      if (!memberTanks.some((tank) => tank.id === activeTank.id)) {
        throw new Error(
          'The configured active tank for this Tanzania fuel grade must be a member of the transaction tank group.',
        )
      }
    } else {
      scopeType = 'ACTIVE_TANK'
      tankGroupId = null
      if (activeTank.tank_group_id) {
        throw new Error(
          'The configured active tank for an ungrouped Tanzania fuel transaction must also be ungrouped.',
        )
      }
      memberTanks = [activeTank]
    }

    if (!memberTanks.length) {
      throw new Error(
        'No ACTIVE same-grade tanks are available for the Tanzania transaction reporting scope.',
      )
    }

    const representativeDomsTankId = normalizeTanzaniaTankId(
      activeTank.doms_tank_id ?? activeTank.code,
    )
    if (!representativeDomsTankId) {
      throw new Error(
        'The active Tanzania reporting tank is missing a DOMS/regulatory Tank_ID.',
      )
    }

    const transactionDate = new Date(context.transaction_date_time)
    const scopeKey =
      scopeType === 'GROUP'
        ? `group:${tankGroupId}`
        : `active-tank:${activeTank.id}`

    const historicalBaseline = await loadSnapshotBaseline({
      client,
      stationId: args.stationId,
      memberTanks,
      transactionDate,
    })
    const baseline =
      historicalBaseline ??
      (await loadReusableProjectionBaseline({
        client,
        stationId: args.stationId,
        transactionId: args.transactionId,
        productId: context.product_id,
        scopeType,
        scopeKey,
        representativeTankId: activeTank.id,
        memberTanks,
        transactionDate: context.transaction_date_time,
        transactionCreatedAt: context.created_at,
      }))
    if (!baseline) {
      throw new Error(
        'No complete ATG capture at or before this transaction is available. FTC also found no earlier persisted Tanzania projection for the same tank scope, so it cannot safely reconstruct the post-sale tank balance.',
      )
    }

    await txQuery(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `tanzania-tank-scope:${args.stationId}:${scopeKey}`,
    ])

    const priorSalesVolumeLitres = await calculatePriorSales({
      client,
      stationId: args.stationId,
      transactionId: args.transactionId,
      productId: context.product_id,
      tankGroupId,
      atgCapturedAt: baseline.atgCapturedAt,
      transactionDate: context.transaction_date_time,
      transactionCreatedAt: context.created_at,
    })
    const reportedVolumeLitres = calculateTanzaniaReportedTankVolume({
      baselineVolumeLitres: baseline.baselineVolumeLitres,
      priorSalesVolumeLitres,
      transactionVolumeLitres: transactionVolume,
    })

    return await persistProjection({
      client,
      projection: {
        stationId: args.stationId,
        transactionId: args.transactionId,
        productId: context.product_id,
        scopeType,
        scopeKey,
        sourceTankId: sourceTank.id,
        sourceDomsTankId: normalizeTanzaniaTankId(
          sourceTank.doms_tank_id ?? sourceTank.code,
        ),
        tankGroupId,
        representativeTankId: activeTank.id,
        representativeDomsTankId,
        atgCapturedAt: baseline.atgCapturedAt,
        baselineVolumeLitres: baseline.baselineVolumeLitres,
        priorSalesVolumeLitres,
        transactionVolumeLitres: transactionVolume,
        reportedVolumeLitres,
        memberTankIds: memberTanks.map((tank) => tank.id),
        memberDomsTankIds: baseline.memberDomsTankIds,
      },
    })
  })
}
