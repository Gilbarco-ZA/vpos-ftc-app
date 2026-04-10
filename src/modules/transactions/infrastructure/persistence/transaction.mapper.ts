import { normalizeTransactionStatus } from '@/src/modules/transactions/domain/transaction-status'

export const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const mapTransactionStatusSnapshot = (row: any) => {
  if (!row) return null

  return {
    id: String(row.id),
    stationId: String(row.stationId),
    customerId: row.customerId ?? null,
    status: normalizeTransactionStatus(row.status),
    deletedAt: row.deletedAt ?? null,
  }
}

export const mapTransactionInvoiceLines = (lines: any[] | null | undefined) => {
  return Array.isArray(lines)
    ? lines.map((line: any) => ({
        productId: line.mapped_product_id ?? line.product_external_id ?? null,
        productCode: line.mapped_product_code ?? line.product_code ?? null,
        productClassCode: line.mapped_product_class_code ?? null,
        productTypeCode: line.mapped_product_type_code ?? null,
        description: line.mapped_description ?? line.product_name ?? null,
        productName: line.source_product_name ?? line.product_name ?? null,
        category: line.category ?? null,
        unitOfMeasure: line.mapped_unit_of_measure ?? null,
        unitOfPackaging: line.mapped_unit_of_packaging ?? null,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        lineTotal: line.line_total,
        currency: line.currency ?? null,
        taxRate: line.mapped_tax_rate ?? null,
        taxCode: line.mapped_tax_code ?? null,
        commodityCode: line.mapped_commodity_code ?? null,
        hazardousIndicator: line.mapped_hazardous_indicator ?? null,
      }))
    : []
}
