import type { ProxyInvoiceRequest } from '@/src/shared/fiscalization/proxy/contracts'

import { normalizeRegisteredCountry } from './countryRegistry'

/**
 * Lossless compatibility serializer for shadow testing against existing proxy output.
 * Input is the CURRENT proxy request, not a canonical invoice.
 * It performs no HTTP calls and does not modify any transaction.
 */
export function serializeFiscalProxyInvoiceForComparison(
  country: unknown,
  invoice: ProxyInvoiceRequest,
): Record<string, unknown> {
  const code = normalizeRegisteredCountry(country)
  if (invoice.countryCode && normalizeRegisteredCountry(invoice.countryCode) !== code) {
    throw new Error('Invoice country does not match selected fiscal country')
  }
  if (code === 'KE') return kenyaProxyShape(invoice)
  return tanzaniaProxyShape(invoice)
}

function omitNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitNulls)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== null && entry !== undefined)
        .map(([key, entry]) => [key, omitNulls(entry)]),
    )
  }
  return value
}

function legacyLineShape(line: NonNullable<ProxyInvoiceRequest['lines']>[number]) {
  return {
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
    taxes: (line.taxes ?? []).map(tax => ({
      type: tax.type ?? null,
      rate: tax.rate ?? 0,
    })),
  }
}

function kenyaProxyShape(invoice: ProxyInvoiceRequest): Record<string, unknown> {
  return omitNulls({
    DocumentId: invoice.documentId ?? null,
    issueDateTime: invoice.issueDateTime,
    createdByName: invoice.createdByName ?? 'VPOS-LITE',
    buyer: invoice.buyer ?? undefined,
    Lines: (invoice.lines ?? []).map(legacyLineShape),
    Currency: invoice.currency ?? 'KES',
    Payment: invoice.payment
      ? { Tenders: invoice.payment.tenders.map(tender => ({
          Method: tender.method,
          Amount: tender.amount,
        })) }
      : undefined,
  }) as Record<string, unknown>
}

function withoutTimezoneSuffix(value: unknown): string {
  return String(value ?? '').trim().replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, '')
}

function tanzaniaProxyShape(invoice: ProxyInvoiceRequest): Record<string, unknown> {
  const localInvoiceDate = withoutTimezoneSuffix(
    invoice.tanzania?.invoiceDate ?? invoice.issueDateTime,
  )
  const tanzania = invoice.tanzania
    ? { ...invoice.tanzania, invoiceDate: localInvoiceDate }
    : undefined
  return omitNulls({
    documentId: invoice.documentId ?? null,
    documentNumber: invoice.documentNumber ?? null,
    documentType: invoice.documentType ?? null,
    issueDateTime: localInvoiceDate,
    currency: invoice.currency ?? null,
    createdByName: invoice.createdByName ?? 'VPOS-LITE',
    isOnline: invoice.isOnline ?? true,
    buyer: invoice.buyer ?? undefined,
    lines: (invoice.lines ?? []).map(line => ({
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
      taxes: (line.taxes ?? []).map(tax => ({
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
  }) as Record<string, unknown>
}
