import type { ProxyInvoiceRequest } from './types'

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

export function toSampleInvoicePayload(invoice: ProxyInvoiceRequest) {
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
