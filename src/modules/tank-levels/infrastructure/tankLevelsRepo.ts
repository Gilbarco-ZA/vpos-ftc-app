import type {
  TankLevelSummary,
  TankOption,
} from '@/src/shared/tank-levels/types'

import { query, queryAll, queryOne } from '@/src/platform/db/postgres'
import { submitStockInToProxy } from '@/src/shared/fiscalization/proxy/client'
import {
  buildGeneratedDocumentId,
  formatDateOnly,
  mapMovementRow,
  normalizeOutboundStockInDocumentId,
  normalizeStockInType,
  toFiniteNumber,
  toIso,
} from '@/src/shared/tank-levels/helpers'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { resolveDeductionProxyStatusForFiscalizedTransaction } from '../application/deductionProxyStatus'

const resolveExistingTable = async (tables: string[]) => {
  const checks = tables
    .map(
      (table, index) =>
        `WHEN to_regclass($${index + 1}) IS NOT NULL THEN $${index + 1}`,
    )
    .join(' ')
  const row = await queryOne<{ table_name: string | null }>(
    `SELECT CASE ${checks} ELSE NULL END AS table_name`,
    tables.map((table) => `public.${table}`),
  )
  return row?.table_name ? row.table_name.replace(/^public\./, '') : null;
}

const getTankInventoryTable = async () => {
  return await resolveExistingTable([
    'tank_inventory_ledger',
    'tank_inventory_movements',
  ])
}

const hasTankLevelsTable = async () => {
  const table = await resolveExistingTable(['tank_levels'])
  return table === 'tank_levels'
}

const toUpperTrimmed = (value: unknown): string | null => {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed.toUpperCase() : null
}

const toTrimmed = (value: unknown): string | null => {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

const roundMoney = (value: number | null | undefined) => {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num)) return 0
  return Number(num.toFixed(2))
}

const normalizeTaxRatePercent = (value: unknown): number | null => {
  const rate = toFiniteNumber(value)
  if (rate == null || !Number.isFinite(rate) || rate < 0) return null
  return rate <= 1 ? roundMoney(rate * 100) : roundMoney(rate)
}

const resolveStockInTaxes = (input: {
  taxCode?: unknown
  extTaxCode?: unknown
  taxRate?: unknown
  unitPrice?: number | null
  quantityLitres?: number | null
}) => {
  const rawTaxCode =
    toUpperTrimmed(input.extTaxCode) ?? toUpperTrimmed(input.taxCode)
  const taxRatePercent = normalizeTaxRatePercent(input.taxRate)
  const quantityLitres = Number(input.quantityLitres ?? 0)
  const unitPriceGross = toFiniteNumber(input.unitPrice, 0) ?? 0
  const grossTotal = roundMoney(unitPriceGross * quantityLitres)

  if (!rawTaxCode && (taxRatePercent == null || taxRatePercent <= 0)) {
    return {
      productUnitPrice: roundMoney(unitPriceGross),
      productPriceExtension: grossTotal,
      productNetTotal: grossTotal,
      taxes: [],
    }
  }

  const safeTaxCode = rawTaxCode ?? 'VAT'
  const rateDecimal = (taxRatePercent ?? 0) / 100
  const divisor = 1 + rateDecimal
  const productUnitPrice =
    divisor > 0
      ? roundMoney(unitPriceGross / divisor)
      : roundMoney(unitPriceGross)
  const productNetTotal = roundMoney(productUnitPrice * quantityLitres)
  const taxAmount = roundMoney(grossTotal - productNetTotal)

  return {
    productUnitPrice,
    productPriceExtension: productNetTotal,
    productNetTotal,
    taxes: [
      {
        type: safeTaxCode,
        rate: taxRatePercent ?? 0,
        base: productNetTotal,
        amount: taxAmount,
      },
    ],
  }
}

export async function listTankOptionsRepo(
  stationId: string,
): Promise<TankOption[]> {
  const rows = await queryAll<any>(
    `SELECT t.id, t.code, t.name, t.capacity_litres,
            p.id AS product_id, p.product_name, p.product_code, p.unit_price, p.tax_code, p.tax_rate,
            p.product_class_code, p.product_type_code, p.unit_of_measure, p.unit_of_packaging,
            p.hazardous_indicator, p.ext_product_id, p.ext_product_code, p.ext_product_class_code,
            p.ext_product_type_code, p.ext_description, p.ext_unit_of_measure, p.ext_unit_of_packaging,
            p.ext_unit_price, p.ext_tax_code, p.ext_hazardous_indicator
       FROM tanks t
       LEFT JOIN products p ON p.id = t.product_id AND p.station_id = t.station_id
      WHERE t.station_id = $1
      ORDER BY t.name ASC`,
    [stationId],
  )
  return rows.map((row) => ({
    id: String(row.id),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    productId: String(row.product_id ?? ''),
    productName: String(row.product_name ?? ''),
    productCode: String(row.product_code ?? ''),
    capacityLitres: Number(row.capacity_litres ?? 0),
    unitPrice: toFiniteNumber(row.unit_price),
    taxCode: row.tax_code ? String(row.tax_code) : null,
    taxRate: toFiniteNumber(row.tax_rate),
    productClassCode: row.product_class_code
      ? String(row.product_class_code)
      : null,
    productTypeCode: row.product_type_code
      ? String(row.product_type_code)
      : null,
    unitOfMeasure: row.unit_of_measure ? String(row.unit_of_measure) : null,
    unitOfPackaging: row.unit_of_packaging
      ? String(row.unit_of_packaging)
      : null,
    hazardousIndicator:
      row.hazardous_indicator == null ? null : Boolean(row.hazardous_indicator),
    extProductId: row.ext_product_id ? String(row.ext_product_id) : null,
    extProductCode: row.ext_product_code ? String(row.ext_product_code) : null,
    extProductClassCode: row.ext_product_class_code
      ? String(row.ext_product_class_code)
      : null,
    extProductTypeCode: row.ext_product_type_code
      ? String(row.ext_product_type_code)
      : null,
    extDescription: row.ext_description ? String(row.ext_description) : null,
    extUnitOfMeasure: row.ext_unit_of_measure
      ? String(row.ext_unit_of_measure)
      : null,
    extUnitOfPackaging: row.ext_unit_of_packaging
      ? String(row.ext_unit_of_packaging)
      : null,
    extUnitPrice: toFiniteNumber(row.ext_unit_price),
    extTaxCode: row.ext_tax_code ? String(row.ext_tax_code) : null,
    extHazardousIndicator:
      row.ext_hazardous_indicator == null
        ? null
        : Boolean(row.ext_hazardous_indicator),
  }))
}

export async function listTankInventoryMovementsRepo(stationId: string) {
  const movementTable = await getTankInventoryTable()
  if (!movementTable) return []

  const rows = await queryAll<any>(
    `SELECT tim.*,
            t.code AS tank_code,
            t.name AS tank_name,
            p.id AS product_id,
            p.product_name,
            p.product_code,
            COALESCE(tx.fiscalization_reference, tx.pos_reference, tx.id::text) AS source_transaction_reference
       FROM ${movementTable} tim
       LEFT JOIN tanks t ON t.id = tim.tank_id
       LEFT JOIN products p ON p.id = t.product_id
       LEFT JOIN transactions tx
         ON tx.id = tim.source_transaction_id
        AND tx.station_id = tim.station_id
      WHERE tim.station_id = $1
      ORDER BY tim.effective_at DESC, tim.created_at DESC
      LIMIT 500`,
    [stationId],
  )
  return rows.map(mapMovementRow)
}

export async function getTankLevelsSnapshotRepo(
  stationId: string,
): Promise<TankLevelSummary[]> {
  const movementTable = await getTankInventoryTable()

  const movementSummaryJoin = movementTable
    ? `
       LEFT JOIN (
         WITH latest_stock_count AS (
           SELECT DISTINCT ON (tank_id)
             tank_id,
             quantity_litres AS stock_count_litres,
             effective_at AS stock_count_at,
             created_at AS stock_count_created_at
           FROM ${movementTable}
           WHERE station_id = $1
             AND movement_type = 'STOCK_IN'
             AND stock_in_type = 'StockCount'
           ORDER BY tank_id, effective_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         )
         SELECT
           m.tank_id,
           lsc.stock_count_litres,
           lsc.stock_count_at,
           COALESCE(
             SUM(
               CASE
                 WHEN lsc.tank_id IS NOT NULL AND m.movement_type = 'STOCK_IN' AND m.stock_in_type = 'StockCount' THEN 0
                 WHEN lsc.tank_id IS NOT NULL
                   AND (
                     m.effective_at < lsc.stock_count_at
                     OR (
                       m.effective_at = lsc.stock_count_at
                       AND COALESCE(m.created_at, m.effective_at) <= COALESCE(lsc.stock_count_created_at, lsc.stock_count_at)
                     )
                   ) THEN 0
                 WHEN m.movement_type = 'STOCK_IN' THEN m.quantity_litres
                 WHEN m.movement_type = 'DEDUCTION' THEN -m.quantity_litres
                 ELSE 0
               END
             ),
             0
           ) AS movement_balance_litres,
           MAX(CASE WHEN m.stock_in_type = 'StockCount' THEN m.effective_at END) AS last_stock_count_at,
           MAX(CASE WHEN m.stock_in_type = 'Delivery' THEN m.effective_at END) AS last_delivery_at,
           MAX(CASE WHEN m.movement_type = 'DEDUCTION' THEN m.effective_at END) AS last_deduction_at,
           COUNT(*) FILTER (WHERE m.proxy_status = 'PENDING')::int AS proxy_pending_count,
           COUNT(*) FILTER (WHERE m.proxy_status = 'FAILED')::int AS proxy_failed_count
         FROM ${movementTable} m
         LEFT JOIN latest_stock_count lsc ON lsc.tank_id = m.tank_id
         WHERE m.station_id = $1
         GROUP BY m.tank_id, lsc.stock_count_litres, lsc.stock_count_at, lsc.stock_count_created_at
       ) tm ON tm.tank_id = t.id`
    : ''

  const movementSummarySelects = movementTable
    ? `CASE
          WHEN tm.stock_count_litres IS NOT NULL THEN 'stock_count'
          WHEN t.manual_volume_litres IS NOT NULL THEN 'manual'
          WHEN t.live_volume_litres IS NOT NULL THEN 'live'
          ELSE 'none'
        END AS baseline_source,
        COALESCE(
          tm.stock_count_litres,
          t.manual_volume_litres,
          t.live_volume_litres,
          0
        ) AS baseline_litres,
        COALESCE(
          tm.stock_count_litres,
          t.manual_volume_litres,
          t.live_volume_litres,
          0
        ) + COALESCE(tm.movement_balance_litres, 0) AS current_volume_litres,
        COALESCE(tm.movement_balance_litres, 0) AS movement_balance_litres,
        tm.last_stock_count_at,
        tm.last_delivery_at,
        tm.last_deduction_at,
        COALESCE(tm.proxy_pending_count, 0) AS proxy_pending_count,
        COALESCE(tm.proxy_failed_count, 0) AS proxy_failed_count`
    : `CASE
          WHEN t.manual_volume_litres IS NOT NULL THEN 'manual'
          WHEN t.live_volume_litres IS NOT NULL THEN 'live'
          ELSE 'none'
        END AS baseline_source,
        COALESCE(t.manual_volume_litres, t.live_volume_litres, 0) AS baseline_litres,
        COALESCE(t.manual_volume_litres, t.live_volume_litres, 0) AS current_volume_litres,
        0 AS movement_balance_litres,
        NULL::timestamptz AS last_stock_count_at,
        NULL::timestamptz AS last_delivery_at,
        NULL::timestamptz AS last_deduction_at,
        0 AS proxy_pending_count,
        0 AS proxy_failed_count`

  const rows = await queryAll<any>(
    `SELECT t.id AS tank_id, t.code AS tank_code, t.name AS tank_name, t.status,
            p.id AS product_id, p.product_name, p.product_code,
            t.capacity_litres, t.low_level_litres, t.critical_level_litres,
            t.live_volume_litres, t.live_volume_updated_at,
            t.manual_volume_litres, t.manual_volume_recorded_at,
            ${movementSummarySelects}
       FROM tanks t
       LEFT JOIN products p ON p.id = t.product_id AND p.station_id = t.station_id
       ${movementSummaryJoin}
      WHERE t.station_id = $1
      ORDER BY t.name ASC`,
    [stationId],
  )

  return rows.map((row) => ({
    tankId: String(row.tank_id),
    tankCode: String(row.tank_code ?? ''),
    tankName: String(row.tank_name ?? ''),
    status: String(row.status ?? 'ACTIVE'),
    productId: String(row.product_id ?? ''),
    productName: String(row.product_name ?? ''),
    productCode: String(row.product_code ?? ''),
    capacityLitres: Number(row.capacity_litres ?? 0),
    lowLevelLitres: toFiniteNumber(row.low_level_litres),
    criticalLevelLitres: toFiniteNumber(row.critical_level_litres),
    liveVolumeLitres: toFiniteNumber(row.live_volume_litres),
    liveVolumeUpdatedAt: toIso(row.live_volume_updated_at),
    manualVolumeLitres: toFiniteNumber(row.manual_volume_litres),
    manualVolumeRecordedAt: toIso(row.manual_volume_recorded_at),
    baselineSource: String(row.baseline_source ?? 'none') as any,
    baselineLitres: Number(row.baseline_litres ?? 0),
    currentVolumeLitres: Number(row.current_volume_litres ?? 0),
    movementBalanceLitres: Number(row.movement_balance_litres ?? 0),
    lastStockCountAt: toIso(row.last_stock_count_at),
    lastDeliveryAt: toIso(row.last_delivery_at),
    lastDeductionAt: toIso(row.last_deduction_at),
    proxyPendingCount: Number(row.proxy_pending_count ?? 0),
    proxyFailedCount: Number(row.proxy_failed_count ?? 0),
  }))
}

export async function createStockEntryRepo(input: {
  stationId: string
  tankId: string
  quantityLitres: number
  stockInType?: 'StockCount' | 'Delivery' | null
  unitPrice?: number | null
  purchaseDate?: string | null
  supplierPin?: string | null
  supplierName?: string | null
  supplierInvoiceNumber?: string | null
  createdByName?: string | null
  effectiveAt?: string | null
  documentId?: string | null
}) {
  const movementTable = await getTankInventoryTable()
  if (!movementTable) {
    throw new Error(
      'Tank inventory table is missing. Apply the latest tank inventory migration.',
    )
  }

  const tank = await queryOne<{ product_id: string | null }>(
    `SELECT product_id
       FROM tanks
      WHERE id = $1 AND station_id = $2
      LIMIT 1`,
    [input.tankId, input.stationId],
  )

  if (!tank?.product_id) {
    throw new Error('Selected tank is not linked to a product.')
  }

  const stockInType = normalizeStockInType(input.stockInType)
  const documentId = normalizeOutboundStockInDocumentId(
    toTrimmed(input.documentId) || buildGeneratedDocumentId(stockInType),
    stockInType,
  )
  const supplierInvoiceNumber =
    toUpperTrimmed(input.supplierInvoiceNumber) ?? documentId.toUpperCase()
  const effectiveAt = input.effectiveAt || new Date().toISOString()

  const row = await queryOne<any>(
    `INSERT INTO ${movementTable} (
       id, station_id, tank_id, product_id, movement_type, stock_in_type, document_id,
       quantity_litres, unit_price, purchase_date, effective_at,
       supplier_pin, supplier_name, supplier_invoice_number, created_by_name,
       proxy_status, created_at
     ) VALUES (
       $1, $2, $3, $4, 'STOCK_IN', $5, $6,
       $7, $8, $9, $10,
       $11, $12, $13, $14,
       'PENDING', NOW()
     ) RETURNING *`,
    [
      uuidv4(),
      input.stationId,
      input.tankId,
      tank.product_id,
      stockInType,
      documentId,
      input.quantityLitres,
      input.unitPrice ?? null,
      input.purchaseDate ?? null,
      effectiveAt,
      input.supplierPin ?? null,
      input.supplierName ?? null,
      supplierInvoiceNumber,
      input.createdByName ?? null,
    ],
  )

  return row ? mapMovementRow(row) : null
}

export async function sendMovementToProxyRepo(
  stationId: string,
  movementId: string,
) {
  const movementTable = await getTankInventoryTable()
  if (!movementTable) {
    throw new Error(
      'Tank inventory table is missing. Apply the latest tank inventory migration.',
    )
  }

  const movement = await queryOne<any>(
    `SELECT tim.*, t.code AS tank_code, t.name AS tank_name,
            p.id AS product_id,
            COALESCE(p.ext_product_id, p.product_id, p.product_code) AS external_product_id,
            COALESCE(p.ext_product_code, p.product_code) AS external_product_code,
            COALESCE(p.ext_product_class_code, p.product_class_code) AS external_product_class_code,
            COALESCE(p.ext_product_type_code, p.product_type_code) AS external_product_type_code,
            COALESCE(p.ext_description, p.product_name, t.name) AS product_description,
            COALESCE(p.ext_unit_of_measure, p.unit_of_measure, 'LTR') AS unit_of_measure,
            COALESCE(p.ext_unit_of_packaging, p.unit_of_packaging, '00') AS unit_of_packaging,
            COALESCE(p.ext_hazardous_indicator, p.hazardous_indicator, FALSE) AS hazardous_indicator,
            COALESCE(p.ext_tax_code, p.tax_code) AS tax_code,
            p.ext_tax_code AS ext_tax_code,
            p.tax_rate AS tax_rate
       FROM ${movementTable} tim
       INNER JOIN tanks t
          ON t.id = tim.tank_id
         AND t.station_id = tim.station_id
       LEFT JOIN products p
          ON p.id = tim.product_id
         AND p.station_id = tim.station_id
      WHERE tim.station_id = $1
        AND tim.id = $2
      LIMIT 1`,
    [stationId, movementId],
  )

  if (!movement) {
    throw new Error('Tank movement was not found.')
  }

  const quantityLitres = Number(movement.quantity_litres ?? 0)
  const unitPrice =
    movement.unit_price == null ? null : toFiniteNumber(movement.unit_price)
  const taxProfile = resolveStockInTaxes({
    taxCode: movement.tax_code,
    extTaxCode: movement.ext_tax_code,
    taxRate: movement.tax_rate,
    unitPrice,
    quantityLitres,
  })

  const stockInRequest = {
    documentId: normalizeOutboundStockInDocumentId(
      movement.document_id ?? movementId,
      movement.stock_in_type,
    ),
    stockInType: normalizeStockInType(movement.stock_in_type),
    purchaseDate: formatDateOnly(
      movement.purchase_date ??
        movement.effective_at ??
        movement.created_at ??
        new Date(),
    ),
    createdByName: movement.created_by_name ?? null,
    supplierPin: movement.supplier_pin ?? null,
    supplierName: movement.supplier_name ?? null,
    supplierInvoiceNumber:
      toUpperTrimmed(movement.supplier_invoice_number) ??
      normalizeOutboundStockInDocumentId(
        movement.document_id ?? movementId,
        movement.stock_in_type,
      ).toUpperCase(),
    items: [
      {
        product: {
          productId:
            movement.external_product_id ??
            movement.product_id ??
            movement.external_product_code ??
            null,
          productCode: movement.external_product_code ?? null,
          productClassCode: movement.external_product_class_code ?? null,
          productTypeCode: movement.external_product_type_code ?? null,
          description:
            movement.product_description ??
            movement.tank_name ??
            'Tank movement',
          quantity: quantityLitres,
          unitOfMeasure: movement.unit_of_measure ?? 'LTR',
          unitOfPackaging: movement.unit_of_packaging ?? '00',
          unitPrice: taxProfile.productUnitPrice,
          priceExtension: taxProfile.productPriceExtension,
          netTotal: taxProfile.productNetTotal,
          hazardousIndicator:
            movement.hazardous_indicator == null
              ? null
              : Boolean(movement.hazardous_indicator),
        },
        discounts: [],
        taxes: taxProfile.taxes,
      },
    ],
  }

  const res = await submitStockInToProxy(
    stationId,
    { stockIn: [stockInRequest] },
    {
      idempotencyKey: `${stationId}:tank-movement:${movementId}`,
    },
  )

  if (!res.ok) {
    await query(
      `UPDATE ${movementTable}
          SET proxy_status = 'FAILED',
              proxy_response = $3::jsonb
        WHERE station_id = $1 AND id = $2`,
      [stationId, movementId, JSON.stringify(res.data ?? {})],
    )
    throw new Error(
      `Proxy submit failed: ${res.status} ${JSON.stringify(res.data ?? {})}`,
    )
  }

  await query(
    `UPDATE ${movementTable}
        SET proxy_status = 'SENT',
            proxy_sent_at = NOW(),
            proxy_response = $3::jsonb
      WHERE station_id = $1 AND id = $2`,
    [stationId, movementId, JSON.stringify(res.data ?? {})],
  )

  return { success: true, movementId, proxy: res.data ?? null }
}

const deriveTransactionNozzleHints = (txn: any) => {
  const payload =
    txn?.doms_payload_json && typeof txn.doms_payload_json === 'object'
      ? txn.doms_payload_json
      : null

  const nozzleIdRaw = payload?.nozzleId
  const nozzleId =
    nozzleIdRaw == null || String(nozzleIdRaw).trim() === ''
      ? null
      : String(nozzleIdRaw).trim()

  const nozzleNumberFromPayload = Number(payload?.nozzleNumber)
  if (Number.isFinite(nozzleNumberFromPayload) && nozzleNumberFromPayload > 0) {
    return { nozzleId, nozzleNumber: nozzleNumberFromPayload }
  }

  const posReference = String(txn?.pos_reference ?? '').trim()
  if (posReference.startsWith('forecourt:')) {
    const parts = posReference.split(':')
    const parsedNozzleNumber = Number(parts[3] ?? NaN)
    if (Number.isFinite(parsedNozzleNumber) && parsedNozzleNumber > 0) {
      return { nozzleId, nozzleNumber: parsedNozzleNumber }
    }
  }

  return { nozzleId, nozzleNumber: null }
}

export async function syncDeductionForTransactionRepo(
  stationId: string,
  transactionId: string,
) {
  const movementTable = await getTankInventoryTable()
  if (!movementTable) {
    return { success: false, reason: 'Tank inventory table not found' }
  }

  const txn = await queryOne<any>(
    `SELECT id, pump_number, volume, transaction_date_time, pos_reference, doms_payload_json
       FROM transactions
      WHERE station_id = $1 AND id = $2`,
    [stationId, transactionId],
  )
  if (!txn) return { success: false, reason: 'Transaction not found' }

  const quantityLitres = Number(txn.volume ?? 0)
  if (!Number.isFinite(quantityLitres) || quantityLitres <= 0) {
    return {
      success: false,
      reason: 'Transaction has no fuel volume to deduct',
    }
  }

  const { nozzleId, nozzleNumber } = deriveTransactionNozzleHints(txn)

  let nozzle = await queryOne<any>(
    `SELECT n.id, n.nozzle_number, n.tank_id, t.product_id
       FROM nozzles n
       INNER JOIN pumps p
         ON p.id = n.pump_id
        AND p.station_id = n.station_id
       INNER JOIN tanks t
         ON t.id = n.tank_id
        AND t.station_id = p.station_id
      WHERE p.station_id = $1
        AND p.pump_number = $2
        AND ($3::text IS NULL OR n.id::text = $3::text)
        AND ($4::int IS NULL OR n.nozzle_number = $4::int)
      ORDER BY n.nozzle_number ASC
      LIMIT 1`,
    [
      stationId,
      txn.pump_number,
      nozzleId,
      nozzleNumber == null ? null : Number(nozzleNumber),
    ],
  )

  if (!nozzle?.tank_id && (nozzleId != null || nozzleNumber != null)) {
    const fallbackNozzle = await queryOne<any>(
      `SELECT n.id, n.nozzle_number, n.tank_id, t.product_id
         FROM nozzles n
         INNER JOIN pumps p
           ON p.id = n.pump_id
          AND p.station_id = n.station_id
         INNER JOIN tanks t
           ON t.id = n.tank_id
          AND t.station_id = p.station_id
        WHERE p.station_id = $1
          AND p.pump_number = $2
        ORDER BY n.nozzle_number ASC
        LIMIT 1`,
      [stationId, txn.pump_number],
    )
    if (fallbackNozzle?.tank_id) {
      nozzle = fallbackNozzle
    }
  }

  if (!nozzle?.tank_id) {
    return { success: false, reason: 'Tank mapping not found' }
  }
  if (!nozzle?.product_id) {
    return { success: false, reason: 'Mapped tank is not linked to a product' }
  }

  const effectiveAt = txn.transaction_date_time ?? new Date().toISOString()
  const existing = await queryOne<any>(
    `SELECT id
       FROM ${movementTable}
      WHERE station_id = $1
        AND source_transaction_id = $2
        AND movement_type = 'DEDUCTION'`,
    [stationId, transactionId],
  )
  if (existing?.id) {
    await query(
      `UPDATE ${movementTable}
          SET tank_id = $3,
              product_id = $4,
              document_id = $5,
              quantity_litres = $6,
              effective_at = $7::timestamptz,
              proxy_status = $8
        WHERE station_id = $1
          AND source_transaction_id = $2
          AND movement_type = 'DEDUCTION'`,
      [
        stationId,
        transactionId,
        nozzle.tank_id,
        nozzle.product_id,
        `TXN-${transactionId}`,
        quantityLitres,
        effectiveAt,
        resolveDeductionProxyStatusForFiscalizedTransaction(),
      ],
    )
    return { success: true, movementId: existing.id, created: false }
  }

  const movement = await queryOne<any>(
    `INSERT INTO ${movementTable} (
     id, station_id, tank_id, product_id, movement_type, document_id, quantity_litres,
     effective_at, source_transaction_id, proxy_status, created_at
    )
    VALUES ($1, $2, $3, $4, 'DEDUCTION', $5, $6, $7::timestamptz, $8, $9, NOW())
    RETURNING *`,
    [
      uuidv4(),
      stationId,
      nozzle.tank_id,
      nozzle.product_id,
      `TXN-${transactionId}`,
      quantityLitres,
      effectiveAt,
      transactionId,
      resolveDeductionProxyStatusForFiscalizedTransaction(),
    ],
  )
  return { success: true, movementId: movement?.id ?? null, created: true }
}

export async function restoreDeductionForCreditedTransactionRepo(
  stationId: string,
  transactionId: string,
) {
  const movementTable = await getTankInventoryTable()
  if (!movementTable) {
    return { success: false, reason: 'Tank inventory table not found' }
  }

  await query(
    `DELETE FROM ${movementTable} WHERE station_id = $1 AND source_transaction_id = $2 AND movement_type = 'DEDUCTION'`,
    [stationId, transactionId],
  )
  return { success: true, transactionId }
}

export function buildStockInPayloadForMovement(movement: any) {
  const documentId = normalizeOutboundStockInDocumentId(
    movement.documentId ?? movement.document_id ?? '',
    movement.stockInType ?? movement.stock_in_type,
  )
  const quantityLitres = Number(
    movement.quantityLitres ?? movement.quantity_litres ?? 0,
  )
  const unitPriceValue = movement.unitPrice ?? movement.unit_price
  const unitPrice =
    unitPriceValue == null ? null : toFiniteNumber(unitPriceValue, 0)
  const taxProfile = resolveStockInTaxes({
    taxCode: movement.taxCode ?? movement.tax_code,
    extTaxCode: movement.extTaxCode ?? movement.ext_tax_code,
    taxRate: movement.taxRate ?? movement.tax_rate,
    unitPrice,
    quantityLitres,
  })

  return {
    stockIn: [
      {
        documentId,
        purchaseDate: formatDateOnly(
          movement.purchaseDate ?? movement.purchase_date ?? new Date(),
        ),
        stockInType: normalizeStockInType(
          movement.stockInType ?? movement.stock_in_type,
        ),
        createdByName:
          movement.createdByName ?? movement.created_by_name ?? null,
        supplierName: movement.supplierName ?? movement.supplier_name ?? null,
        supplierPin: movement.supplierPin ?? movement.supplier_pin ?? null,
        supplierInvoiceNumber:
          toUpperTrimmed(
            movement.supplierInvoiceNumber ?? movement.supplier_invoice_number,
          ) ?? documentId.toUpperCase(),
        items: [
          {
            product: {
              productId:
                movement.productId ??
                movement.product_id ??
                movement.external_product_id ??
                movement.productCode ??
                movement.product_code ??
                movement.external_product_code ??
                null,
              productCode:
                movement.productCode ??
                movement.product_code ??
                movement.external_product_code ??
                null,
              productClassCode:
                movement.productClassCode ??
                movement.product_class_code ??
                movement.external_product_class_code ??
                null,
              productTypeCode:
                movement.productTypeCode ??
                movement.product_type_code ??
                movement.external_product_type_code ??
                null,
              description:
                movement.description ??
                movement.productDescription ??
                movement.product_description ??
                movement.tankName ??
                movement.tank_name ??
                'Tank movement',
              quantity: quantityLitres,
              unitOfMeasure:
                movement.unitOfMeasure ?? movement.unit_of_measure ?? 'LTR',
              unitOfPackaging:
                movement.unitOfPackaging ?? movement.unit_of_packaging ?? '00',
              unitPrice: taxProfile.productUnitPrice,
              priceExtension: taxProfile.productPriceExtension,
              netTotal: taxProfile.productNetTotal,
              hazardousIndicator:
                movement.hazardousIndicator ??
                movement.hazardous_indicator ??
                null,
            },
            discounts: [],
            taxes: taxProfile.taxes,
          },
        ],
      },
    ],
  }
}
