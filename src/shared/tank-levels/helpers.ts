import type { TankInventoryMovement } from '@/src/shared/tank-levels/types'

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

export function toIso(value?: string | Date | null): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function formatDateOnly(value?: string | Date | null): string {
  const iso = toIso(value)
  return iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10)
}

export function normalizeStockInType(
  value?: string | null,
): 'StockCount' | 'Delivery' {
  return String(value || '')
    .trim()
    .toLowerCase() === 'delivery'
    ? 'Delivery'
    : 'StockCount'
}

export const KENYA_DELIVERY_DOCUMENT_ID_MAX = 2147483647

export function normalizeDeliveryDocumentId(
  value?: string | number | null,
): string {
  const trimmed = String(value ?? '').trim()
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed)
    if (
      Number.isSafeInteger(parsed) &&
      parsed > 0 &&
      parsed <= KENYA_DELIVERY_DOCUMENT_ID_MAX
    ) {
      return String(parsed)
    }
  }

  return String(
    Math.min(Math.floor(Date.now() / 1000), KENYA_DELIVERY_DOCUMENT_ID_MAX),
  )
}

export function normalizeOutboundStockInDocumentId(
  value: string | number | null | undefined,
  stockInType?: string | null,
): string {
  return normalizeStockInType(stockInType) === 'Delivery'
    ? normalizeDeliveryDocumentId(value)
    : String(value ?? '').trim() || buildGeneratedDocumentId('StockCount')
}

export function buildGeneratedDocumentId(value?: string | null): string {
  const type = normalizeStockInType(value)
  if (type === 'Delivery') {
    return normalizeDeliveryDocumentId(null)
  }
  return `SC-${Date.now().toString(36).toUpperCase()}`
}

export function mapMovementRow(
  row: Record<string, unknown>,
): TankInventoryMovement {
  return {
    id: String(row.id ?? ''),
    stationId: String(row.station_id ?? row.stationId ?? ''),
    tankId: String(row.tank_id ?? row.tankId ?? ''),
    tankCode: row.tank_code ? String(row.tank_code) : undefined,
    tankName: row.tank_name ? String(row.tank_name) : undefined,
    productId: row.product_id ? String(row.product_id) : undefined,
    productName: row.product_name ? String(row.product_name) : undefined,
    productCode: row.product_code ? String(row.product_code) : undefined,
    movementType: String(row.movement_type ?? row.movementType ?? ''),
    stockInType: row.stock_in_type
      ? normalizeStockInType(String(row.stock_in_type))
      : null,
    documentId: row.document_id ? String(row.document_id) : null,
    quantityLitres: toFiniteNumber(row.quantity_litres ?? row.quantityLitres),
    unitPrice: row.unit_price == null ? null : toFiniteNumber(row.unit_price),
    purchaseDate: row.purchase_date
      ? formatDateOnly(String(row.purchase_date))
      : null,
    effectiveAt: toIso((row.effective_at ?? row.effectiveAt) as any),
    supplierPin: row.supplier_pin ? String(row.supplier_pin) : null,
    supplierName: row.supplier_name ? String(row.supplier_name) : null,
    supplierInvoiceNumber: row.supplier_invoice_number
      ? String(row.supplier_invoice_number).toUpperCase()
      : null,
    createdByName: row.created_by_name ? String(row.created_by_name) : null,
    proxyStatus: row.proxy_status ? String(row.proxy_status) : null,
    proxySentAt: toIso((row.proxy_sent_at ?? row.proxySentAt) as any),
    sourceTransactionId: row.source_transaction_id
      ? String(row.source_transaction_id)
      : null,
    sourceTransactionReference: row.source_transaction_reference
      ? String(row.source_transaction_reference)
      : null,
    createdAt: toIso((row.created_at ?? row.createdAt) as any),
  }
}
