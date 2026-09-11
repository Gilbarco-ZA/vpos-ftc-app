import type { ProxyInvoiceRequest } from '@/src/shared/fiscalization/proxy/contracts'

function compact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => compact(item)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== null && entry !== undefined)
        .map(([key, entry]) => [key, compact(entry)]),
    ) as T
  }
  return value
}

function withoutTimezoneSuffix(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return text
  return text.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, '')
}

function toLegacyInvoicePayload(invoice: ProxyInvoiceRequest) {
  return compact({
    DocumentId: invoice.documentId ?? null,
    issueDateTime: invoice.issueDateTime,
    createdByName: invoice.createdByName ?? 'VPOS-LITE',
    buyer: invoice.buyer ?? undefined,
    Lines: (invoice.lines ?? []).map((line) => ({
      lineType: line.lineType ?? null,
      product: line.product
        ? {
            productId: line.product.productId ?? null,
            productCode: line.product.productCode ?? null,
            productClassCode: line.product.productClassCode ?? null,
            productTypeCode: line.product.productTypeCode ?? null,
            description: line.product.description ?? null,
            unitOfMeasure: line.product.unitOfMeasure ?? null,
            unitOfPackaging: line.product.unitOfPackaging ?? null,
            quantity: line.product.quantity,
            unitPrice: line.product.unitPrice ?? null,
            hazardousIndicator: line.product.hazardousIndicator ?? null,
            fuel: line.product.fuel ?? undefined,
          }
        : null,
      taxes: (line.taxes ?? []).map((tax) => ({
        type: tax.type ?? null,
        rate: tax.rate ?? 0,
      })),
    })),
  })
}

function toTanzaniaInvoicePayload(invoice: ProxyInvoiceRequest) {
  const localInvoiceDate = withoutTimezoneSuffix(
    invoice.tanzania?.invoiceDate ?? invoice.issueDateTime,
  )
  const tanzania = invoice.tanzania
    ? {
        ...invoice.tanzania,
        invoiceDate: localInvoiceDate,
      }
    : undefined

  return compact({
    documentId: invoice.documentId ?? null,
    documentNumber: invoice.documentNumber ?? null,
    documentType: invoice.documentType ?? null,
    // Tanzania fiscal timestamps are already formatted in the effective local
    // timezone (Site Profile override, otherwise device/runtime local time).
    // Keep them offset-free for vpos-proxy and keep both timestamp fields
    // identical so no downstream component can select a different clock.
    issueDateTime: localInvoiceDate,
    currency: invoice.currency ?? null,
    createdByName: invoice.createdByName ?? 'VPOS-LITE',
    isOnline: invoice.isOnline ?? true,
    buyer: invoice.buyer ?? undefined,
    lines: (invoice.lines ?? []).map((line) => ({
      lineType: line.lineType ?? null,
      lineId: line.lineId ?? null,
      product: line.product
        ? {
            productId: line.product.productId ?? null,
            productCode: line.product.productCode ?? null,
            productClassCode: line.product.productClassCode ?? null,
            productTypeCode: line.product.productTypeCode ?? null,
            description: line.product.description ?? null,
            unitOfMeasure: line.product.unitOfMeasure ?? null,
            unitOfPackaging: line.product.unitOfPackaging ?? null,
            quantity: line.product.quantity,
            unitPrice: line.product.unitPrice ?? null,
            priceExtension: line.product.priceExtension ?? null,
            netTotal: line.product.netTotal ?? null,
            commodityCode: line.product.commodityCode ?? null,
            hazardousIndicator: line.product.hazardousIndicator ?? null,
            fuel: line.product.fuel ?? undefined,
          }
        : null,
      taxes: (line.taxes ?? []).map((tax) => ({
        type: tax.type ?? null,
        rate: tax.rate ?? 0,
        base: tax.base ?? null,
        amount: tax.amount ?? null,
        exemptionCode: tax.exemptionCode ?? null,
      })),
      discounts: line.discounts ?? undefined,
    })),
    totals: invoice.totals ?? undefined,
    payment: invoice.payment ?? undefined,
    notes: invoice.notes ?? null,
    countryCode: invoice.countryCode ?? null,
    tanzania,
  })
}

export function toCountrySpecificInvoicePayload(invoice: ProxyInvoiceRequest) {
  const isTanzania =
    invoice.countryCode?.trim().toUpperCase() === 'TZ' ||
    Boolean(invoice.tanzania)

  return isTanzania
    ? toTanzaniaInvoicePayload(invoice)
    : toLegacyInvoicePayload(invoice)
}

/** @deprecated Use toCountrySpecificInvoicePayload. */
export const toSampleInvoicePayload = toCountrySpecificInvoicePayload
