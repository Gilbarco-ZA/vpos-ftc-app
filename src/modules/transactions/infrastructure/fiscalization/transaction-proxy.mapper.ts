import type {
  InvoiceLineDto,
  InvoiceLineProductDto,
  InvoiceLineTaxDto,
  ProxyInvoiceRequest,
} from '@/src/shared/fiscalization/proxy/contracts'

function iso(dt: any) {
  try {
    const d = dt instanceof Date ? dt : new Date(dt)
    return d.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function num(v: any, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function roundMoney(value: number, fallback = 0) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : fallback
}

function normalizeRate(value: any, fallback = 0) {
  if (value == null) return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  if (n < 0) return 0
  return n > 1 ? n / 100 : n
}

function strOrNull(value: any) {
  if (value == null) return null
  const s = String(value).trim()
  return s.length ? s : null
}

function defaultRateForTaxCode(code: string, vatRate: number): number {
  switch (code.toUpperCase()) {
    case 'A': // Exempt
    case 'C': // Zero Rated
    case 'D': // Non VAT
      return 0
    case 'B': // VAT
    default:
      return vatRate
  }
}

type MappableTransactionLine = {
  productId?: string | null
  productCode?: string | null
  productClassCode?: string | null
  productTypeCode?: string | null
  description?: string | null
  productName?: string | null
  category?: string | null
  unitOfMeasure?: string | null
  unitOfPackaging?: string | null
  quantity?: number | string | null
  unitPrice?: number | string | null
  lineTotal?: number | string | null
  currency?: string | null
  taxRate?: number | string | null
  taxCode?: string | null
  commodityCode?: string | null
  hazardousIndicator?: boolean | null
  gradeId?: string | null
  gradeName?: string | null
  tankId?: string | null
  pumpId?: string | null
  nozzleId?: string | null
}

function isFuelLikeLine(
  line: MappableTransactionLine,
  txn: any,
  enrichment: any = {},
) {
  const tokens = [
    line.category,
    line.description,
    line.productName,
    line.productCode,
    txn.fuel_type,
    txn.fuelType,
    txn.grade_name,
    txn.gradeName,
    enrichment.gradeName,
    enrichment.description,
    enrichment.productCode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (
    /(fuel|petrol|diesel|gasoline|gasolina|kerosene|super|unleaded|octane|lpg|cng|ago|pms)/.test(
      tokens,
    )
  ) {
    return true
  }

  const lineProductId = strOrNull(line.productId)
  const lineProductCode = strOrNull(line.productCode)
  const enrichedProductId = strOrNull(enrichment.productId)
  const enrichedProductCode = strOrNull(enrichment.productCode)
  const txnGradeId = strOrNull(txn.grade_id ?? txn.gradeId)

  if (
    (lineProductId &&
      enrichedProductId &&
      lineProductId === enrichedProductId) ||
    (lineProductCode &&
      enrichedProductCode &&
      lineProductCode === enrichedProductCode) ||
    (lineProductCode && txnGradeId && lineProductCode === txnGradeId)
  ) {
    return true
  }

  if (
    line.gradeId != null ||
    line.gradeName != null ||
    line.tankId != null ||
    line.pumpId != null ||
    line.nozzleId != null ||
    txn.grade_id != null ||
    txn.grade_name != null ||
    txn.tank_id != null ||
    txn.nozzle_id != null
  ) {
    return true
  }

  return false
}

export function mapTransactionToProxyInvoice(args: {
  transaction: any
  customer: any | null
  station: any | null
  currency?: string | null
  vatRate?: number | null
  taxType?: string | null
  taxRate?: number | null
  createdByName?: string | null
  enrichment?: {
    productId?: string | null
    productCode?: string | null
    productClassCode?: string | null
    productTypeCode?: string | null
    gradeId?: string | null
    gradeName?: string | null
    tankId?: string | null
    pumpId?: string | null
    nozzleId?: string | null
    unitOfMeasure?: string | null
    unitOfPackaging?: string | null
    unitPrice?: number | null
    taxRate?: number | null
    currency?: string | null
    taxCode?: string | null
    commodityCode?: string | null
    hazardousIndicator?: boolean | null
    description?: string | null
  }
}): ProxyInvoiceRequest {
  const txn = args.transaction ?? {}
  const customer = args.customer ?? null
  const enrichment = args.enrichment ?? {}

  const currency =
    enrichment.currency != null
      ? String(enrichment.currency)
      : args.currency != null
        ? String(args.currency)
        : txn.currency != null
          ? String(txn.currency)
          : process.env.DEFAULT_CURRENCY?.trim() || 'USD'

  const vatRate = normalizeRate(args.vatRate, 0.16)
  const hasExplicitLines =
    Array.isArray((txn as any).lines) && (txn as any).lines.length > 0

  let lines: InvoiceLineDto[] = []
  let hasAnyFuelLine = false

  if (!hasExplicitLines) {
    const volumeQty = Math.max(0, num(txn.volume, 0))
    const unitQty = Math.max(
      0,
      num(
        txn.quantity ??
          txn.qty ??
          txn.unit_quantity ??
          txn.unitQuantity ??
          txn.volume ??
          args.transaction.volume ??
          0,
      ),
    )
    const gross = roundMoney(num(txn.total_amount ?? txn.totalAmount, 0))
    const priceExtensionValue = roundMoney(gross, 0)

    const taxTypeCode = String(enrichment.taxCode || args.taxType || 'B')
    const codeFallback = defaultRateForTaxCode(taxTypeCode, vatRate)
    const lineTaxRate = roundMoney(
      normalizeRate(enrichment.taxRate ?? args.taxRate, codeFallback),
    )
    const taxRatePercent = roundMoney(lineTaxRate * 100)

    const net = roundMoney(
      lineTaxRate > 0 ? gross / (1 + lineTaxRate) : gross,
      priceExtensionValue,
    )
    const tax = roundMoney(Math.max(0, priceExtensionValue - net), 0)

    const fuelDesc =
      strOrNull(
        txn.fuel_type ??
          txn.fuelType ??
          enrichment.gradeName ??
          enrichment.description,
      ) ?? 'Fuel'

    const taxes: InvoiceLineTaxDto[] = [
      {
        type: taxTypeCode,
        rate: taxRatePercent,
        base: net,
        amount: tax,
        exemptionCode: null,
      },
    ]

    const fuel = {
      gradeId: strOrNull(
        enrichment.gradeId ??
          txn.grade_id ??
          txn.gradeId ??
          enrichment.productCode ??
          txn.product_code ??
          txn.productCode,
      ),
      gradeName: strOrNull(
        enrichment.gradeName ?? txn.grade_name ?? txn.gradeName ?? fuelDesc,
      ),
      tankId: strOrNull(enrichment.tankId ?? txn.tank_id ?? txn.tankId),
      pumpId: strOrNull(
        enrichment.pumpId ?? txn.pump_id ?? txn.pumpId ?? txn.pump_number,
      ),
      nozzleId: strOrNull(
        enrichment.nozzleId ??
          txn.nozzle_id ??
          txn.nozzleId ??
          txn.nozzle_number,
      ),
    }

    const hasFuel = Object.values(fuel).some((value) => value != null)
    hasAnyFuelLine = hasFuel
    const qty = hasFuel ? volumeQty : unitQty

    const unitGrossPrice =
      typeof enrichment.unitPrice === 'number' &&
      Number.isFinite(enrichment.unitPrice)
        ? Number(enrichment.unitPrice)
        : qty > 0
          ? gross / qty
          : gross
    const unitNetPrice =
      lineTaxRate > 0 ? unitGrossPrice / (1 + lineTaxRate) : unitGrossPrice

    const product: InvoiceLineProductDto = {
      productId: strOrNull(
        enrichment.productId ?? txn.product_id ?? txn.productId,
      ),
      productCode: strOrNull(
        enrichment.productCode ?? txn.product_code ?? txn.productCode,
      ),
      productClassCode: strOrNull(
        enrichment.productClassCode ??
          txn.product_class_code ??
          txn.productClassCode,
      ),
      productTypeCode: strOrNull(
        enrichment.productTypeCode ??
          txn.product_type_code ??
          txn.productTypeCode,
      ),
      description:
        strOrNull(enrichment.description ?? fuelDesc) ?? fuelDesc ?? 'Fuel',
      unitOfMeasure:
        strOrNull(
          enrichment.unitOfMeasure ?? txn.unit_of_measure ?? txn.unitOfMeasure,
        ) ?? (hasFuel ? 'L' : null),
      unitOfPackaging: strOrNull(
        enrichment.unitOfPackaging ??
          (txn as any).unit_of_packaging ??
          (txn as any).unitOfPackaging,
      ),
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unitPrice:
        typeof enrichment.unitPrice === 'number'
          ? Number(unitNetPrice.toFixed(2))
          : Number.isFinite(unitNetPrice)
            ? Number(unitNetPrice.toFixed(2))
            : 0,
      priceExtension: priceExtensionValue,
      netTotal: net,
      commodityCode: strOrNull(
        enrichment.commodityCode ?? txn.commodity_code ?? txn.commodityCode,
      ),
      hazardousIndicator:
        enrichment.hazardousIndicator != null
          ? enrichment.hazardousIndicator
          : typeof txn.hazardous_indicator === 'boolean'
            ? txn.hazardous_indicator
            : typeof txn.hazardousIndicator === 'boolean'
              ? txn.hazardousIndicator
              : true,
      fuel: hasFuel ? fuel : null,
    }

    lines = [
      {
        lineType: 'Sale',
        lineId: '1',
        product,
        taxes,
        discounts: null,
      },
    ]
  } else {
    const rawLines = (txn as any).lines as MappableTransactionLine[]
    lines = rawLines.map((rawLine, index) => {
      const quantity = Math.max(0, num(rawLine.quantity, 0)) || 1
      const lineGross = roundMoney(
        num(rawLine.lineTotal, num(rawLine.unitPrice, 0) * quantity),
        0,
      )
      const unitGrossPrice =
        quantity > 0
          ? lineGross / quantity
          : roundMoney(num(rawLine.unitPrice, 0), 0)

      const taxTypeCode = String(
        rawLine.taxCode || enrichment.taxCode || args.taxType || 'B',
      )
      const codeFallback = defaultRateForTaxCode(taxTypeCode, vatRate)
      const lineTaxRate = roundMoney(
        normalizeRate(
          rawLine.taxRate ?? enrichment.taxRate ?? args.taxRate,
          codeFallback,
        ),
      )
      const taxRatePercent = roundMoney(lineTaxRate * 100)
      const net = roundMoney(
        lineTaxRate > 0 ? lineGross / (1 + lineTaxRate) : lineGross,
        lineGross,
      )
      const tax = roundMoney(Math.max(0, lineGross - net), 0)
      const unitNetPrice =
        lineTaxRate > 0 ? unitGrossPrice / (1 + lineTaxRate) : unitGrossPrice
      const fuelLine = isFuelLikeLine(rawLine, txn, enrichment)

      const fuel = {
        gradeId: strOrNull(
          rawLine.gradeId ??
            enrichment.gradeId ??
            txn.grade_id ??
            txn.gradeId ??
            rawLine.productCode,
        ),
        gradeName: strOrNull(
          rawLine.gradeName ??
            enrichment.gradeName ??
            txn.grade_name ??
            txn.gradeName ??
            rawLine.description ??
            rawLine.productName ??
            txn.fuel_type ??
            txn.fuelType,
        ),
        tankId: strOrNull(
          rawLine.tankId ?? enrichment.tankId ?? txn.tank_id ?? txn.tankId,
        ),
        pumpId: strOrNull(
          rawLine.pumpId ??
            enrichment.pumpId ??
            txn.pump_id ??
            txn.pumpId ??
            txn.pump_number,
        ),
        nozzleId: strOrNull(
          rawLine.nozzleId ??
            enrichment.nozzleId ??
            txn.nozzle_id ??
            txn.nozzleId ??
            txn.nozzle_number,
        ),
      }
      const hasFuel =
        fuelLine && Object.values(fuel).some((value) => value != null)
      if (hasFuel) hasAnyFuelLine = true

      const taxes: InvoiceLineTaxDto[] = [
        {
          type: taxTypeCode,
          rate: taxRatePercent,
          base: net,
          amount: tax,
          exemptionCode: null,
        },
      ]

      const product: InvoiceLineProductDto = {
        productId: strOrNull(rawLine.productId ?? enrichment.productId),
        productCode: strOrNull(rawLine.productCode ?? enrichment.productCode),
        productClassCode: strOrNull(
          rawLine.productClassCode ?? enrichment.productClassCode,
        ),
        productTypeCode: strOrNull(
          rawLine.productTypeCode ?? enrichment.productTypeCode,
        ),
        description:
          strOrNull(
            rawLine.description ??
              rawLine.productName ??
              enrichment.description,
          ) ?? 'Product',
        unitOfMeasure:
          strOrNull(rawLine.unitOfMeasure ?? enrichment.unitOfMeasure) ??
          (hasFuel ? 'L' : null),
        unitOfPackaging: strOrNull(
          rawLine.unitOfPackaging ?? enrichment.unitOfPackaging,
        ),
        quantity,
        unitPrice: Number.isFinite(unitNetPrice)
          ? Number(unitNetPrice.toFixed(2))
          : 0,
        priceExtension: lineGross,
        netTotal: net,
        commodityCode: strOrNull(
          rawLine.commodityCode ?? enrichment.commodityCode,
        ),
        hazardousIndicator:
          rawLine.hazardousIndicator != null
            ? rawLine.hazardousIndicator
            : enrichment.hazardousIndicator != null
              ? enrichment.hazardousIndicator
              : hasFuel,
        fuel: hasFuel ? fuel : null,
      }

      return {
        lineType: hasFuel ? 'FuelSale' : 'Sale',
        lineId: String(index + 1),
        product,
        taxes,
        discounts: null,
      }
    })
  }

  const totals = lines.reduce(
    (acc, line) => {
      const priceExtension = roundMoney(num(line.product?.priceExtension, 0), 0)
      const net = roundMoney(num(line.product?.netTotal, 0), 0)
      const tax = roundMoney(num(line.taxes?.[0]?.amount, 0), 0)
      acc.priceExtension = roundMoney(acc.priceExtension + priceExtension, 0)
      acc.net = roundMoney(acc.net + net, 0)
      acc.tax = roundMoney(acc.tax + tax, 0)
      acc.amount = roundMoney(acc.amount + priceExtension, 0)
      return acc
    },
    {
      priceExtension: 0,
      discount: 0,
      charge: 0,
      net: 0,
      tax: 0,
      amount: 0,
    },
  )

  const rawDocumentId = String(txn.pos_reference ?? txn.posReference ?? txn.id)
    .trim()
    .toUpperCase()
  const documentId =
    rawDocumentId.length <= 45 ? rawDocumentId : String(txn.id).toUpperCase()

  const buyerSource = customer ?? null
  const buyerHasData = !!(
    buyerSource &&
    (buyerSource.buyer_name ||
      buyerSource.buyerName ||
      buyerSource.name ||
      buyerSource.tin ||
      buyerSource.pin)
  )

  const invoice: ProxyInvoiceRequest = {
    documentId,
    documentNumber: strOrNull(txn.document_number ?? txn.documentNumber),
    documentType: 'Invoice',
    issueDateTime: iso(
      txn.transaction_date_time ??
        txn.transactionDateTime ??
        txn.created_at ??
        txn.createdAt,
    ),
    currency: strOrNull(currency),
    countryCode: strOrNull(args.station?.country)?.toUpperCase() ?? null,
    createdByName: strOrNull(
      args.createdByName ?? txn.created_by_name ?? txn.createdByName,
    ),
    seller: null,
    buyer: buyerHasData
      ? {
          name: strOrNull(
            buyerSource.buyer_name ?? buyerSource.buyerName ?? buyerSource.name,
          ),
          buyerType: strOrNull(buyerSource.buyer_type ?? buyerSource.buyerType),
          pin: strOrNull(buyerSource.pin),
          passportNumber: strOrNull(
            buyerSource.passport_number ?? buyerSource.passportNumber,
          ),
          businessName: strOrNull(
            buyerSource.business_name ?? buyerSource.businessName,
          ),
          // tax: {
          //   tin: strOrNull(buyerSource.tin),
          //   ninbrn: strOrNull(buyerSource.tax_ninbrn ?? buyerSource.taxNinbrn),
          // },
          // address: {
          //   street: strOrNull(
          //     buyerSource.address_street ?? buyerSource.addressStreet,
          //   ),
          //   city: strOrNull(
          //     buyerSource.address_city ?? buyerSource.addressCity,
          //   ),
          //   state: strOrNull(
          //     buyerSource.address_state ?? buyerSource.addressState,
          //   ),
          //   province: strOrNull(
          //     buyerSource.address_province ?? buyerSource.addressProvince,
          //   ),
          //   postalCode: strOrNull(
          //     buyerSource.address_postal_code ?? buyerSource.addressPostalCode,
          //   ),
          //   countryCode: strOrNull(
          //     buyerSource.address_country_code ??
          //       buyerSource.addressCountryCode ??
          //       buyerSource.country,
          //   ),
          // },
          // contact: {
          //   phone: strOrNull(
          //     buyerSource.contact_phone ?? buyerSource.contactPhone,
          //   ),
          //   mobile: strOrNull(
          //     buyerSource.contact_mobile ?? buyerSource.contactMobile,
          //   ),
          //   fax: strOrNull(buyerSource.contact_fax ?? buyerSource.contactFax),
          //   email: strOrNull(
          //     buyerSource.contact_email ?? buyerSource.contactEmail,
          //   ),
          //   website: strOrNull(
          //     buyerSource.contact_website ?? buyerSource.contactWebsite,
          //   ),
          //   contactPerson: strOrNull(
          //     buyerSource.contact_person ?? buyerSource.contactPerson,
          //   ),
          // },
        }
      : null,
    lines,
    totals,
    notes:
      strOrNull(txn.notes) ??
      (hasAnyFuelLine ? 'AUTO_ENRICHED_FROM_FORECOURT' : null),
  }

  return invoice
}

/**
 * Build a credit note that reverses the full amount of a previously fiscalized transaction.
 *
 * IMPORTANT:
 * - Uses the same product mapping rules as invoices (including ext_* overrides).
 * - Negates monetary amounts (unitPrice, net/tax totals) while keeping quantity positive.
 */
export function mapTransactionToProxyCreditNote(
  args: Parameters<typeof mapTransactionToProxyInvoice>[0] & {
    creditNoteId: string
    documentReference?: string | null
    documentNumber?: string | null
    reasonCode?: string | null
    notes?: string | null
  },
): import('@/src/shared/fiscalization/proxy/contracts').ProxyCreditNotesRequest {
  // Reuse the invoice mapper because it already applies ext_* product overrides.
  const invoice = mapTransactionToProxyInvoice(args)

  const reasonCode = (() => {
    const raw = String(args.reasonCode ?? '').trim()
    return raw.length ? raw : '13'
  })()

  const documentReference = (() => {
    const raw = String(
      args.documentReference ??
        invoice.documentNumber ??
        invoice.documentId ??
        '',
    ).trim()
    return raw.length ? raw : null
  })()

  const createdByName =
    strOrNull(args.createdByName ?? invoice.createdByName) ?? 'VPOS-LITE'

  const isOnline = invoice.isOnline ?? true

  const documentNumber = (() => {
    const raw = String(
      args.documentNumber ??
        invoice.documentNumber ??
        documentReference ??
        args.creditNoteId,
    ).trim()
    return raw.length ? raw : null
  })()

  const reason = (() => {
    const raw = String(args.notes ?? invoice.notes ?? '').trim()
    return raw.length ? raw : 'Credit note issued'
  })()

  // Build credit note lines in the shape expected by proxy/cloud contract.
  const Lines = (invoice.lines ?? []).map((line) => {
    const product = line?.product
      ? {
          productId: line.product.productId ?? null,
          productCode: line.product.productCode ?? null,
          productClassCode: line.product.productClassCode ?? null,
          productTypeCode: line.product.productTypeCode ?? null,
          description: line.product.description ?? null,
          unitOfMeasure: line.product.unitOfMeasure ?? null,
          unitOfPackaging: line.product.unitOfPackaging ?? null,
          quantity: Number(line.product.quantity ?? 0),
          unitPrice: line.product.unitPrice ?? null,
          hazardousIndicator: line.product.hazardousIndicator ?? null,
          fuel: line.product.fuel
            ? {
                gradeId: line.product.fuel.gradeId ?? null,
                gradeName: line.product.fuel.gradeName ?? null,
                tankId: line.product.fuel.tankId ?? null,
                pumpId: line.product.fuel.pumpId ?? null,
                nozzleId: line.product.fuel.nozzleId ?? null,
              }
            : null,
        }
      : null

    const taxes = (line?.taxes ?? []).map((t) => ({
      type: t?.type ?? null,
      rate: t?.rate ?? 16,
    }))

    return {
      lineType: line?.lineType ?? 'Sale',
      product,
      taxes,
    }
  })

  return {
    creditNotes: [
      {
        IsOnline: isOnline,
        isOnline,
        DocumentId: String(args.creditNoteId),
        documentId: String(args.creditNoteId),
        documentNumber,
        documentReference,
        documentType: 'Return',
        modificationType: 'None',
        issueDateTime: invoice.issueDateTime,
        createdByName,
        reasonCode,
        reason,
        Lines,
        lines: Lines,
      },
    ],
  }
}
