import type { StockMovementType } from '@/src/modules/stock/domain/stockMovement'

export type StockPayloadSource = {
  id: string
  movementType: StockMovementType
  reason: string
  documentId: string
  documentReference: string | null
  remarks: string | null
  effectiveAt: string
  createdByName: string
  supplierName: string | null
  supplierPin: string | null
  supplierInvoiceNumber: string | null
  quantity: number
  unitCost: number | null
  productId: string
  productCode: string
  productClassCode: string | null
  productTypeCode: string | null
  description: string
  unitOfMeasure: string
  unitOfPackaging: string
  hazardousIndicator: boolean
  taxCode: string | null
  taxRate: number | null
}

const roundMoney = (value: number) => Number(value.toFixed(2))

const normalizeTaxRatePercent = (value: number | null): number | null => {
  if (value == null || !Number.isFinite(value) || value < 0) return null
  return value <= 1 ? roundMoney(value * 100) : roundMoney(value)
}

const dateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Stock movement effective date is invalid.')
  }
  return date.toISOString()
}

const requiredCloudIdentifier = (value: unknown, field: string) => {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required for stock sync.`)
  if (normalized.length > 45) {
    throw new Error(`${field} exceeds the cloud limit of 45 characters.`)
  }
  return normalized
}

const optionalCloudIdentifier = (value: unknown, field: string) => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  if (normalized.length > 45) {
    throw new Error(`${field} exceeds the cloud limit of 45 characters.`)
  }
  return normalized
}

const truncate = (value: unknown, maxLength: number) =>
  String(value ?? '')
    .trim()
    .slice(0, maxLength)

const buildTaxProfile = (source: StockPayloadSource) => {
  const rate = normalizeTaxRatePercent(source.taxRate)
  const grossUnitCost = Number(source.unitCost ?? 0)
  const grossTotal = roundMoney(grossUnitCost * source.quantity)
  const taxCode = String(source.taxCode ?? '')
    .trim()
    .toUpperCase()

  if ((!taxCode && (!rate || rate <= 0)) || grossTotal <= 0) {
    return {
      unitPrice: roundMoney(grossUnitCost),
      priceExtension: grossTotal,
      netTotal: grossTotal,
      taxes: [] as Array<Record<string, number | string>>,
    }
  }

  const divisor = 1 + (rate ?? 0) / 100
  const netTotal = divisor > 0 ? roundMoney(grossTotal / divisor) : grossTotal
  const unitPrice =
    source.quantity > 0
      ? roundMoney(netTotal / source.quantity)
      : roundMoney(grossUnitCost)
  const amount = roundMoney(grossTotal - netTotal)

  return {
    unitPrice,
    priceExtension: netTotal,
    netTotal,
    taxes: [
      {
        type: taxCode || 'VAT',
        rate: rate ?? 0,
        base: netTotal,
        amount,
      },
    ],
  }
}

const buildProductLine = (source: StockPayloadSource) => {
  const tax = buildTaxProfile(source)

  return {
    product: {
      productId: requiredCloudIdentifier(source.productId, 'Product ID'),
      productCode: requiredCloudIdentifier(source.productCode, 'Product code'),
      productClassCode: optionalCloudIdentifier(
        source.productClassCode,
        'Product class code',
      ),
      productTypeCode: optionalCloudIdentifier(
        source.productTypeCode,
        'Product type code',
      ),
      description: truncate(source.description, 45),
      quantity: source.quantity,
      unitOfMeasure: source.unitOfMeasure,
      unitOfPackaging: source.unitOfPackaging,
      unitPrice: tax.unitPrice,
      priceExtension: tax.priceExtension,
      netTotal: tax.netTotal,
      hazardousIndicator: source.hazardousIndicator,
    },
    discounts: [],
    taxes: tax.taxes,
  }
}

export function buildStockProxyPayload(source: StockPayloadSource) {
  const line = buildProductLine(source)

  if (source.movementType === 'STOCK_IN') {
    return {
      path: '/api/stockin',
      responseKey: 'stockIn' as const,
      body: {
        stockIn: [
          {
            documentId: requiredCloudIdentifier(
              source.documentId,
              'Document ID',
            ),
            stockInType: requiredCloudIdentifier(
              source.reason,
              'Stock-in type',
            ),
            purchaseDate: dateTime(source.effectiveAt),
            createdByName: source.createdByName,
            supplierPin: optionalCloudIdentifier(
              source.supplierPin,
              'Supplier PIN',
            ),
            supplierName: optionalCloudIdentifier(
              source.supplierName,
              'Supplier name',
            ),
            supplierInvoiceNumber: requiredCloudIdentifier(
              source.supplierInvoiceNumber || source.documentId,
              'Supplier invoice number',
            ),
            items: [line],
          },
        ],
      },
    }
  }

  return {
    path: '/api/stockout',
    responseKey: 'stockOut' as const,
    body: {
      stockOut: [
        {
          documentId: requiredCloudIdentifier(source.documentId, 'Document ID'),
          documentReference: requiredCloudIdentifier(
            source.documentReference || source.documentId,
            'Reference document',
          ),
          stockAdjustmentType: requiredCloudIdentifier(
            source.reason,
            'Stock adjustment type',
          ),
          remarks: source.remarks ? truncate(source.remarks, 500) : null,
          purchaseDate: dateTime(source.effectiveAt),
          createdByName: source.createdByName,
          items: [line],
        },
      ],
    },
  }
}

export function assessStockProxyResponse(
  data: unknown,
  responseKey: 'stockIn' | 'stockOut',
): { ok: boolean; message: string | null } {
  const envelope =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const nested =
    envelope.data && typeof envelope.data === 'object'
      ? (envelope.data as Record<string, unknown>)
      : null
  const payloads = nested ? [envelope, nested] : [envelope]
  const responseKeys =
    responseKey === 'stockIn'
      ? (['stockIn', 'stockIns'] as const)
      : (['stockOut', 'stockOuts'] as const)
  const entries = payloads.flatMap((payload) =>
    responseKeys.flatMap((key) =>
      Array.isArray(payload[key])
        ? (payload[key] as Array<Record<string, unknown>>)
        : [],
    ),
  )

  const failedEntry = entries.find((entry) => {
    const status = String(entry?.status ?? '')
      .trim()
      .toUpperCase()
    return (
      entry?.error === true ||
      entry?.success === false ||
      ['FAILED', 'ERROR', 'REJECTED'].includes(status)
    )
  })

  const failedPayload = payloads.find((payload) => {
    const status = String(payload.status ?? '')
      .trim()
      .toUpperCase()
    return (
      payload.error === true ||
      payload.success === false ||
      ['FAILED', 'ERROR', 'REJECTED'].includes(status)
    )
  })
  const failedResponseCode = payloads
    .map((payload) =>
      String(payload.responseCode ?? '')
        .trim()
        .toUpperCase(),
    )
    .find(
      (responseCode) =>
        Boolean(responseCode) &&
        responseCode !== '200' &&
        responseCode !== 'OFFLINE_SUCCESS',
    )

  if (!failedPayload && !failedEntry && !failedResponseCode) {
    return { ok: true, message: null }
  }

  const source = failedEntry ?? failedPayload ?? envelope
  const message =
    String(
      source.message ??
        source.errorMessage ??
        envelope.message ??
        envelope.errorMessage ??
        nested?.message ??
        nested?.errorMessage ??
        (failedResponseCode
          ? `vpos-proxy returned response code ${failedResponseCode}.`
          : 'Stock update was rejected by vpos-proxy.'),
    ).trim() || 'Stock update was rejected by vpos-proxy.'

  return { ok: false, message }
}
