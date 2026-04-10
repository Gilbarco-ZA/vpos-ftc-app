import { toNumberStrict } from '@/src/shared/numbers'
import {
  DecimalSettings,
  DecimalSettingsOverrides,
  resolveDecimalSettings,
} from '@/src/shared/receipts/decimalSettings'

export type NormalizedReceipt = {
  header: {
    title: string
    stationName?: string
    stationId?: string
    companyName?: string
    companyTin?: string
    companyPin?: string
    companyVrn?: string
    companyMobile?: string
    companySerial?: string
    companyTaxOffice?: string
    country?: string
  }
  meta: {
    receiptNumber?: string
    receiptZNumber?: string
    receiptDateTime?: string
    documentNumber?: string
    fiscalReference?: string
    attendant?: string
    scuId?: string
    cuInvoiceNo?: string
  }
  buyer?: {
    name?: string
    tin?: string
    pin?: string
    odometer?: string
    paymentType?: string
    vehicleRegNr?: string
  }
  items: Array<{
    description: string
    qty?: number
    unitPrice?: number
    amount?: number
    taxType?: string
  }>
  totals: {
    amount?: number
    tax?: number
    net?: number
    currency?: string
  }
  footer: {
    receiptInternalData?: string
    receiptSignature?: string
    fiscalVerificationCode?: string
    fiscalQrCodeData?: string
    copyLabel?: string
  }
  branding?: {
    logoPath?: string
    primaryColor?: string
    secondaryColor?: string
    stationDisplayName?: string
    receiptHeaderText?: string
    receiptFooterText?: string
  }
  /** Decimal formatting overrides for money, volume, and unit price (0-3, default 2). */
  decimals: DecimalSettings
}

const safeParse = (value: any) => {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

const toStringSafe = (value: any) => {
  const v = String(value ?? '').trim()
  return v.length ? v : undefined
}

const toNumberSafe = (value: any): number | undefined =>
  toNumberStrict(value) ?? undefined

const pickFirst = (...values: any[]) => {
  for (const value of values) {
    const v = toStringSafe(value)
    if (v) return v
  }
  return undefined
}

const extractReceipt = (raw: any) => {
  const explicitReceipt =
    raw?.receipt ||
    raw?.details?.receipt ||
    raw?.data?.receipt ||
    raw?.payload?.receipt ||
    raw?.result?.receipt ||
    null

  if (explicitReceipt && typeof explicitReceipt === 'object') {
    return explicitReceipt
  }

  const detailLike =
    raw?.details || raw?.data?.details || raw?.payload?.details || null

  const hasInlineReceiptFields =
    detailLike?.receiptNumber ||
    detailLike?.receipt_number ||
    detailLike?.receiptDate ||
    detailLike?.receipt_date ||
    detailLike?.receiptTime ||
    detailLike?.receipt_time ||
    detailLike?.receiptInternalData ||
    detailLike?.receipt_internal_data ||
    detailLike?.receiptSignature ||
    detailLike?.receipt_signature ||
    detailLike?.fiscalVerificationCode ||
    detailLike?.fiscal_verification_code ||
    detailLike?.fiscalQrCodeData ||
    detailLike?.fiscal_qr_code_data

  return hasInlineReceiptFields ? detailLike : null
}

const extractItems = (raw: any) => {
  const list =
    raw?.details?.items ||
    raw?.details?.lines ||
    raw?.items ||
    raw?.lines ||
    raw?.lineItems ||
    raw?.details?.lineItems ||
    []
  return Array.isArray(list) ? list : []
}

const extractTotals = (raw: any) => {
  return (
    raw?.details?.totals ||
    raw?.details?.summary ||
    raw?.totals ||
    raw?.summary ||
    raw?.details ||
    {}
  )
}

const buildReceiptDateTime = (receipt: any, fallback?: string) => {
  const date = pickFirst(receipt?.receiptDate, receipt?.receipt_date)
  const time = pickFirst(receipt?.receiptTime, receipt?.receipt_time)
  if (date && time) return `${date} ${time}`
  if (date) return date
  return fallback
}

export const normalizeReceipt = (opts: {
  transaction: any
  stationName?: string
  station?: any
  stationTaxNumber?: string
  stationPin?: string
  transactionLines?: any[]
  raw: any
  attendantName?: string
  /** Decimal overrides from station settings (0-3). */
  decimalOverrides?: DecimalSettingsOverrides
  /** Override the receipt title (e.g. 'CREDIT NOTE'). */
  titleOverride?: string
  branding?: {
    logoPath?: string | null
    primaryColor?: string | null
    secondaryColor?: string | null
    stationDisplayName?: string | null
    receiptHeaderText?: string | null
    receiptFooterText?: string | null
  }
}): NormalizedReceipt | null => {
  const {
    transaction,
    stationName,
    station,
    stationTaxNumber,
    stationPin,
    transactionLines,
    raw,
    attendantName,
    decimalOverrides,
    titleOverride,
    branding,
  } = opts
  const parsed = safeParse(raw)
  if (!parsed) return null

  const extractedReceipt = extractReceipt(parsed)
  const hasFallbackReceiptContext = Boolean(
    parsed?.ok === true ||
    parsed?.success === true ||
    pickFirst(
      parsed?.reference,
      parsed?.details?.reference,
      transaction?.fiscalization_reference,
      transaction?.fiscalizationReference,
    ) ||
    transaction?.fiscalized_at ||
    transaction?.fiscalizedAt ||
    String(transaction?.status ?? '')
      .trim()
      .toUpperCase() === 'FISCALIZED',
  )
  if (
    extractedReceipt &&
    typeof extractedReceipt !== 'object' &&
    !hasFallbackReceiptContext
  ) {
    return null
  }
  if (!extractedReceipt && !hasFallbackReceiptContext) return null
  const receipt =
    extractedReceipt && typeof extractedReceipt === 'object'
      ? extractedReceipt
      : {}

  const dbLines = Array.isArray(transactionLines) ? transactionLines : []
  const itemsSource = extractItems(parsed)
  const items = dbLines.length
    ? dbLines.map((line: any) => {
        const qty = toNumberSafe(line?.quantity ?? line?.qty ?? line?.volume)
        const unitPrice = toNumberSafe(
          line?.unit_price ?? line?.unitPrice ?? line?.price,
        )
        const amountRaw = toNumberSafe(
          line?.amount ?? line?.line_total ?? line?.total,
        )
        const amount =
          amountRaw ??
          (qty != null && unitPrice != null ? qty * unitPrice : undefined)
        const taxType = pickFirst(
          line?.tax_type,
          line?.taxType,
          line?.tax_code,
          line?.taxCode,
          line?.ext_tax_code,
          line?.extTaxCode,
        )
        return {
          description:
            pickFirst(
              line?.description,
              line?.product_name,
              line?.productName,
              line?.fuelType,
              line?.fuel_type,
            ) ||
            pickFirst(transaction?.fuel_type, transaction?.fuelType) ||
            'Item',
          qty,
          unitPrice,
          amount,
          taxType: taxType ? taxType.toUpperCase() : undefined,
        }
      })
    : itemsSource.length
      ? itemsSource.map((item: any) => {
          const qty = toNumberSafe(item?.qty ?? item?.quantity ?? item?.volume)
          const unitPrice = toNumberSafe(
            item?.unitPrice ?? item?.unit_price ?? item?.price,
          )
          const amountRaw = toNumberSafe(
            item?.amount ?? item?.total ?? item?.lineTotal ?? item?.line_total,
          )
          const amount =
            amountRaw ??
            (qty != null && unitPrice != null ? qty * unitPrice : undefined)
          const taxType = pickFirst(
            item?.taxType,
            item?.tax_type,
            item?.taxCode,
            item?.tax_code,
          )
          return {
            description:
              pickFirst(
                item?.description,
                item?.name,
                item?.productName,
                item?.product_name,
                item?.fuelType,
                item?.fuel_type,
              ) || 'Item',
            qty,
            unitPrice,
            amount,
            taxType: taxType ? taxType.toUpperCase() : undefined,
          }
        })
      : (() => {
          const fbQty = toNumberSafe(transaction?.volume) ?? 1
          const fbAmount = toNumberSafe(
            transaction?.total_amount ?? transaction?.totalAmount,
          )
          const fbUnitPrice =
            fbQty > 0 && fbAmount != null ? fbAmount / fbQty : fbAmount
          return [
            {
              description:
                pickFirst(transaction?.fuel_type, transaction?.fuelType) ||
                'Fuel',
              qty: fbQty,
              unitPrice: fbUnitPrice ?? undefined,
              amount: fbAmount,
              taxType: undefined,
            },
          ]
        })()

  const totalsSource = extractTotals(parsed)
  const totalAmount = toNumberSafe(
    totalsSource?.total ||
      totalsSource?.grandTotal ||
      totalsSource?.grand_total ||
      totalsSource?.amount ||
      transaction?.total_amount ||
      transaction?.totalAmount,
  )
  const taxAmount = toNumberSafe(
    totalsSource?.tax || totalsSource?.taxAmount || totalsSource?.tax_amount,
  )
  const netAmount = toNumberSafe(
    totalsSource?.net || totalsSource?.netAmount || totalsSource?.net_amount,
  )

  const receiptDateTime = buildReceiptDateTime(
    receipt,
    transaction?.transaction_date_time
      ? String(transaction.transaction_date_time)
      : undefined,
  )

  const decimals = resolveDecimalSettings(decimalOverrides)

  return {
    header: {
      title: titleOverride || 'NORMAL SALES RECEIPT',
      stationName,
      stationId: toStringSafe(
        transaction?.station_id ?? transaction?.stationId,
      ),
      companyName: pickFirst(
        receipt?.companyName,
        receipt?.company_name,
        receipt?.stationName,
        receipt?.station_name,
        station?.name,
      ),
      companyTin: pickFirst(
        receipt?.companyTin,
        receipt?.company_tin,
        stationTaxNumber,
        station?.tin,
        station?.tax_pin,
        station?.taxPin,
      ),
      companyPin:
        pickFirst(
          receipt?.companyPin,
          receipt?.company_pin,
          stationPin,
          station?.pin,
        ) || 'D000000003K',
      companyVrn: pickFirst(receipt?.companyVrn, receipt?.company_vrn),
      companyMobile: pickFirst(receipt?.companyMobile, receipt?.company_mobile),
      companySerial: pickFirst(receipt?.companySerial, receipt?.company_serial),
      companyTaxOffice: pickFirst(
        receipt?.companyTaxOffice,
        receipt?.company_tax_office,
      ),
      country: pickFirst(
        station?.country,
        transaction?.station_country,
        transaction?.stationCountry,
        transaction?.country,
      ),
    },
    meta: {
      receiptNumber: pickFirst(
        receipt?.receiptNumber,
        receipt?.receipt_number,
        transaction?.receipt_number,
        transaction?.receiptNumber,
        transaction?.fiscalization_reference,
        transaction?.fiscalizationReference,
      ),
      receiptZNumber: pickFirst(
        receipt?.receiptZNumber,
        receipt?.receipt_z_number,
      ),
      receiptDateTime,
      documentNumber: pickFirst(
        receipt?.documentNumber,
        receipt?.document_number,
        transaction?.pos_reference,
        transaction?.posReference,
      ),
      fiscalReference: pickFirst(
        transaction?.fiscalization_reference,
        transaction?.fiscalizationReference,
      ),
      attendant: attendantName,
      scuId: pickFirst(
        parsed?.scu_id,
        parsed?.scuId,
        parsed?.details?.scu_id,
        parsed?.details?.scuId,
        receipt?.scu_id,
        receipt?.scuId,
        receipt?.device_id,
        receipt?.deviceId,
      ),
      cuInvoiceNo: pickFirst(
        parsed?.cu_invoice_no,
        parsed?.cuInvoiceNo,
        parsed?.details?.cu_invoice_no,
        parsed?.details?.cuInvoiceNo,
        parsed?.details?.fiscal_number,
        parsed?.details?.fiscalNumber,
        receipt?.cu_invoice_no,
        receipt?.cuInvoiceNo,
      ),
    },
    buyer: {
      name: pickFirst(transaction?.buyer_name, transaction?.buyerName),
      tin: pickFirst(transaction?.tin, transaction?.buyer_tin),
      pin: pickFirst(transaction?.pin, transaction?.buyer_pin),
      odometer: pickFirst(transaction?.odometer),
      paymentType: pickFirst(
        transaction?.payment_type,
        transaction?.paymentType,
      ),
      vehicleRegNr: pickFirst(
        transaction?.vehicle_reg_nr,
        transaction?.vehicleRegNr,
      ),
    },
    items,
    totals: {
      amount: totalAmount,
      tax: taxAmount,
      net: netAmount,
      currency: pickFirst(
        transaction?.currency,
        parsed?.currency,
        parsed?.details?.currency,
      ),
    },
    footer: {
      receiptInternalData: pickFirst(
        receipt?.receiptInternalData,
        receipt?.receipt_internal_data,
        receipt?.receiptInternalData,
      ),
      receiptSignature: pickFirst(
        receipt?.receiptSignature,
        receipt?.receipt_signature,
      ),
      fiscalVerificationCode: pickFirst(
        receipt?.fiscalVerificationCode,
        receipt?.fiscal_verification_code,
      ),
      fiscalQrCodeData: pickFirst(
        receipt?.fiscalQrCodeData,
        receipt?.fiscal_qr_code_data,
      ),
      copyLabel: 'This is a COPY 1',
    },
    branding: branding
      ? {
          logoPath: toStringSafe(branding.logoPath),
          primaryColor: toStringSafe(branding.primaryColor),
          secondaryColor: toStringSafe(branding.secondaryColor),
          stationDisplayName: toStringSafe(branding.stationDisplayName),
          receiptHeaderText: toStringSafe(branding.receiptHeaderText),
          receiptFooterText: toStringSafe(branding.receiptFooterText),
        }
      : undefined,
    decimals,
  }
}
