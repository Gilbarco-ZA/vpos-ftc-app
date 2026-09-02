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
    companyUin?: string
    companyTaxOffice?: string
    country?: string
  }
  meta: {
    receiptNumber?: string
    receiptZNumber?: string
    receiptDateTime?: string
    receiptDate?: string
    receiptTime?: string
    receiptTraNumber?: string
    pumpNumber?: string
    nozzleNumber?: string
    documentNumber?: string
    fiscalReference?: string
    attendant?: string
    scuId?: string
    cuInvoiceNo?: string
    offlinePending?: boolean
    isOfflineFiscalization?: boolean
    fiscalizationStatus?: string
  }
  buyer?: {
    name?: string
    tin?: string
    pin?: string
    buyerType?: string
    odometer?: string
    paymentType?: string
    vehicleRegNr?: string
  }
  items: Array<{
    description: string
    productCode?: string
    sku?: string
    qty?: number
    unitPrice?: number
    amount?: number
    taxType?: string
    taxRate?: number
  }>
  totals: {
    amount?: number
    tax?: number
    net?: number
    currency?: string
    discount?: number
    paymentMethod?: string
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

const scuIdFromReceiptNumber = (value: any) => {
  const receiptNumber = toStringSafe(value)
  if (!receiptNumber || !receiptNumber.includes('/')) return undefined
  const prefix = receiptNumber.split('/')[0]?.trim()
  return prefix || undefined
}

const extractReceipt = (raw: any) => {
  const model = raw?.model ?? raw?.fiscalData?.model
  if (model?.station && model?.fiscalMeta) {
    const zNumber = toStringSafe(model.fiscalMeta.zNumber)
    return {
      companyName: model.station.name,
      companyTin: model.station.taxId,
      companyVrn: model.station.vrn,
      companyMobile: model.station.mobile,
      companySerial: model.station.serial,
      companyUin: model.station.uin,
      companyTaxOffice: model.station.taxOffice,
      receiptNumber: model.fiscalMeta.receiptNumber,
      receiptTraNumber: model.fiscalMeta.traReceiptNumber,
      receiptZNumber: zNumber,
      receiptDate: model.transaction?.receiptDate,
      receiptTime: model.transaction?.receiptTime,
      fiscalVerificationCode: model.fiscalMeta.verificationCode,
      fiscalQrCodeData:
        model.qrPayload?.data ?? model.fiscalMeta.verificationUrl,
    }
  }

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
    raw?.model?.items ||
    raw?.fiscalData?.model?.items ||
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
  const model = raw?.model ?? raw?.fiscalData?.model
  if (model?.payment) {
    const tax = Array.isArray(model.taxSummary)
      ? model.taxSummary.reduce(
          (sum: number, entry: any) => sum + Number(entry?.taxAmount || 0),
          0,
        )
      : undefined
    return {
      total: model.payment.amount,
      tax,
      net: tax == null ? undefined : Number(model.payment.amount || 0) - tax,
      currency: model.payment.currency,
      discount: model.payment.discount,
      paymentMethod: model.payment.method,
    }
  }
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

const pickScuId = (
  parsed: any,
  receipt: any,
  fallbackReceiptNumber?: string,
) => {
  const details =
    parsed?.details ||
    parsed?.data?.details ||
    parsed?.payload?.details ||
    parsed?.result?.details ||
    parsed?.response?.details
  const data =
    parsed?.data || parsed?.payload || parsed?.result || parsed?.response
  const device =
    parsed?.device ||
    parsed?.fiscalDevice ||
    parsed?.fiscal_device ||
    data?.device ||
    data?.fiscalDevice ||
    data?.fiscal_device ||
    details?.device ||
    details?.fiscalDevice ||
    details?.fiscal_device ||
    receipt?.device ||
    receipt?.fiscalDevice ||
    receipt?.fiscal_device

  const receiptNumber = pickFirst(
    receipt?.receiptNumber,
    receipt?.receipt_number,
    details?.receiptNumber,
    details?.receipt_number,
    data?.receiptNumber,
    data?.receipt_number,
    parsed?.receiptNumber,
    parsed?.receipt_number,
  )

  return (
    pickFirst(
      parsed?.scu_id,
      parsed?.scuId,
      parsed?.scuID,
      parsed?.SCUID,
      parsed?.device_id,
      parsed?.deviceId,
      data?.scu_id,
      data?.scuId,
      data?.scuID,
      data?.SCUID,
      data?.device_id,
      data?.deviceId,
      details?.scu_id,
      details?.scuId,
      details?.scuID,
      details?.SCUID,
      details?.device_id,
      details?.deviceId,
      receipt?.scu_id,
      receipt?.scuId,
      receipt?.scuID,
      receipt?.SCUID,
      receipt?.device_id,
      receipt?.deviceId,
      device?.scu_id,
      device?.scuId,
      device?.scuID,
      device?.SCUID,
      device?.device_id,
      device?.deviceId,
      device?.cloud_device_id,
      device?.cloudDeviceId,
    ) ||
    scuIdFromReceiptNumber(receiptNumber) ||
    scuIdFromReceiptNumber(fallbackReceiptNumber)
  )
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
  /** Allow a non-fiscalized transaction to render as a clearly labelled preview. */
  allowUnfiscalizedPreview?: boolean
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
    allowUnfiscalizedPreview = false,
    branding,
  } = opts
  const transactionStatus = String(transaction?.status ?? '')
    .trim()
    .toUpperCase()
  const hasFiscalReference = Boolean(
    pickFirst(
      transaction?.fiscalization_reference,
      transaction?.fiscalizationReference,
    ),
  )
  const isFinalFiscalized = Boolean(
    hasFiscalReference ||
    transaction?.fiscalized_at ||
    transaction?.fiscalizedAt ||
    ['FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED'].includes(
      transactionStatus,
    ),
  )
  const isOfflineFiscalization = Boolean(
    !isFinalFiscalized &&
    ['ALLOCATED', 'FISCALIZING', 'FAILED'].includes(transactionStatus),
  )
  const parsed = safeParse(raw) ?? {}
  const receiptModel = parsed?.model ?? parsed?.fiscalData?.model ?? null

  const extractedReceipt = extractReceipt(parsed)
  const fiscalReference = pickFirst(
    parsed?.reference,
    parsed?.details?.reference,
    transaction?.fiscalization_reference,
    transaction?.fiscalizationReference,
  )
  const isOfflinePending =
    !fiscalReference &&
    ['ALLOCATED', 'FISCALIZING', 'FAILED', 'PENDING'].includes(
      transactionStatus,
    )
  const hasFallbackReceiptContext = Boolean(
    isOfflinePending ||
    parsed?.ok === true ||
    parsed?.success === true ||
    fiscalReference ||
    transaction?.fiscalized_at ||
    transaction?.fiscalizedAt ||
    isFinalFiscalized ||
    isOfflineFiscalization ||
    allowUnfiscalizedPreview,
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
        const taxRate = toNumberSafe(line?.tax_rate ?? line?.taxRate)
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
          productCode: pickFirst(
            line?.product_code,
            line?.productCode,
            line?.ext_product_code,
            line?.extProductCode,
          ),
          sku: pickFirst(line?.sku),
          qty,
          unitPrice,
          amount,
          taxType: taxType ? taxType.toUpperCase() : undefined,
          taxRate,
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
          const taxRate = toNumberSafe(
            item?.tax_rate ?? item?.taxRate ?? item?.vat_rate ?? item?.vatRate,
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
            productCode: pickFirst(
              item?.productCode,
              item?.product_code,
              item?.extProductCode,
              item?.ext_product_code,
            ),
            sku: pickFirst(item?.sku),
            qty,
            unitPrice,
            amount,
            taxType: taxType ? taxType.toUpperCase() : undefined,
            taxRate,
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
              productCode: pickFirst(
                transaction?.product_code,
                transaction?.productCode,
                transaction?.ext_product_code,
                transaction?.extProductCode,
                transaction?.grade_id,
                transaction?.gradeId,
              ),
              sku: pickFirst(transaction?.sku),
              qty: fbQty,
              unitPrice: fbUnitPrice ?? undefined,
              amount: fbAmount,
              taxType: pickFirst(
                transaction?.tax_type,
                transaction?.taxType,
                transaction?.tax_code,
                transaction?.taxCode,
                transaction?.ext_tax_code,
                transaction?.extTaxCode,
              )?.toUpperCase(),
              taxRate: toNumberSafe(
                transaction?.tax_rate ?? transaction?.taxRate,
              ),
            },
          ]
        })()

  const totalsSource = extractTotals(parsed)
  const explicitTotalAmount = toNumberSafe(
    totalsSource?.total ??
      totalsSource?.grandTotal ??
      totalsSource?.grand_total ??
      totalsSource?.amount ??
      transaction?.total_amount ??
      transaction?.totalAmount,
  )
  const explicitTaxAmount = toNumberSafe(
    totalsSource?.tax ?? totalsSource?.taxAmount ?? totalsSource?.tax_amount,
  )
  const explicitNetAmount = toNumberSafe(
    totalsSource?.net ?? totalsSource?.netAmount ?? totalsSource?.net_amount,
  )

  const itemTotals = items.reduce(
    (acc, item) => {
      const amount =
        item.amount ??
        (item.qty != null && item.unitPrice != null
          ? item.qty * item.unitPrice
          : undefined)
      if (amount == null || !Number.isFinite(amount)) return acc

      acc.gross += amount

      if (item.taxRate == null || !Number.isFinite(Number(item.taxRate))) {
        acc.net += amount
        return acc
      }

      const rawRate = Number(item.taxRate)
      const ratePercent = rawRate > 0 && rawRate <= 1 ? rawRate * 100 : rawRate
      const lineNet =
        ratePercent > 0 ? amount / (1 + ratePercent / 100) : amount
      acc.net += lineNet
      acc.tax += amount - lineNet
      acc.hasTaxRate = true
      return acc
    },
    { gross: 0, net: 0, tax: 0, hasTaxRate: false },
  )

  const totalAmount =
    explicitTotalAmount ??
    (itemTotals.gross > 0 ? Number(itemTotals.gross.toFixed(2)) : undefined)
  const hasInvalidZeroNet = Boolean(
    explicitNetAmount === 0 &&
    (totalAmount ?? itemTotals.gross) > 0 &&
    itemTotals.net > 0,
  )
  const taxAmount =
    explicitTaxAmount == null ||
    (hasInvalidZeroNet && explicitTaxAmount === 0 && itemTotals.tax > 0)
      ? itemTotals.hasTaxRate
        ? Number(itemTotals.tax.toFixed(2))
        : undefined
      : explicitTaxAmount
  const derivedNetAmount =
    itemTotals.gross > 0
      ? Number(itemTotals.net.toFixed(2))
      : totalAmount != null
        ? Number((totalAmount - (taxAmount ?? 0)).toFixed(2))
        : undefined
  const netAmount =
    explicitNetAmount == null ||
    (hasInvalidZeroNet && (derivedNetAmount ?? 0) > 0)
      ? derivedNetAmount
      : explicitNetAmount
  const discountAmount = toNumberSafe(totalsSource?.discount)
  const paymentMethod = pickFirst(
    totalsSource?.paymentMethod,
    receiptModel?.payment?.method,
    transaction?.payment_type,
    transaction?.paymentType,
  )

  const receiptDateTime = buildReceiptDateTime(
    receipt,
    transaction?.transaction_date_time
      ? String(transaction.transaction_date_time)
      : undefined,
  )

  const decimals = resolveDecimalSettings(decimalOverrides)
  const receiptNumber = pickFirst(
    receipt?.receiptNumber,
    receipt?.receipt_number,
    transaction?.receipt_number,
    transaction?.receiptNumber,
    transaction?.fiscalization_reference,
    transaction?.fiscalizationReference,
  )

  return {
    header: {
      title:
        titleOverride ||
        (allowUnfiscalizedPreview ? 'RECEIPT PREVIEW' : undefined) ||
        (String(
          receipt?.country ??
            receiptModel?.station?.country ??
            station?.country ??
            transaction?.station_country ??
            '',
        )
          .trim()
          .toUpperCase() === 'TZ'
          ? 'TRA FISCAL RECEIPT'
          : isOfflinePending
            ? 'OFFLINE RECEIPT'
            : 'NORMAL SALES RECEIPT'),
      stationName,
      stationId: toStringSafe(
        transaction?.station_id ?? transaction?.stationId,
      ),
      companyName: pickFirst(
        receipt?.companyName,
        receipt?.company_name,
        receipt?.stationName,
        receipt?.station_name,
        receiptModel?.station?.name,
        station?.name,
      ),
      companyTin: pickFirst(
        receipt?.companyTin,
        receipt?.company_tin,
        stationTaxNumber,
        station?.tin,
        station?.tax_pin,
        station?.taxPin,
        receiptModel?.station?.taxId,
      ),
      companyPin:
        pickFirst(
          receipt?.companyPin,
          receipt?.company_pin,
          stationPin,
          station?.pin,
        ) || 'D000000003K',
      companyVrn: pickFirst(
        receipt?.companyVrn,
        receipt?.company_vrn,
        receiptModel?.station?.vrn,
      ),
      companyMobile: pickFirst(
        receipt?.companyMobile,
        receipt?.company_mobile,
        receiptModel?.station?.mobile,
      ),
      companySerial: pickFirst(
        receipt?.companySerial,
        receipt?.company_serial,
        receiptModel?.station?.serial,
      ),
      companyUin: pickFirst(
        receipt?.companyUin,
        receipt?.company_uin,
        receiptModel?.station?.uin,
      ),
      companyTaxOffice: pickFirst(
        receipt?.companyTaxOffice,
        receipt?.company_tax_office,
        receiptModel?.station?.taxOffice,
      ),
      country: pickFirst(
        receipt?.country,
        receiptModel?.station?.country,
        station?.country,
        transaction?.station_country,
        transaction?.stationCountry,
        transaction?.country,
      ),
    },
    meta: {
      receiptNumber,
      receiptZNumber: pickFirst(
        receipt?.receiptZNumber,
        receipt?.receipt_z_number,
      ),
      receiptDateTime,
      receiptDate: pickFirst(
        receipt?.receiptDate,
        receipt?.receipt_date,
        receiptModel?.transaction?.receiptDate,
      ),
      receiptTime: pickFirst(
        receipt?.receiptTime,
        receipt?.receipt_time,
        receiptModel?.transaction?.receiptTime,
      ),
      receiptTraNumber: pickFirst(
        receipt?.receiptTraNumber,
        receipt?.receipt_tra_number,
        receiptModel?.fiscalMeta?.traReceiptNumber,
      ),
      pumpNumber: pickFirst(
        receiptModel?.transaction?.pumpNumber,
        transaction?.pump_number,
        transaction?.pumpNumber,
      ),
      nozzleNumber: pickFirst(
        receiptModel?.transaction?.nozzleNumber,
        transaction?.nozzle_number,
        transaction?.nozzleNumber,
      ),
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
      scuId: pickScuId(parsed, receipt, receiptNumber),
      isOfflineFiscalization,
      offlinePending: isOfflinePending,
      fiscalizationStatus: transactionStatus || undefined,
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
      name: pickFirst(
        transaction?.buyer_name,
        transaction?.buyerName,
        receiptModel?.customer?.name,
      ),
      tin: pickFirst(
        transaction?.tin,
        transaction?.buyer_tin,
        receiptModel?.customer?.tin,
      ),
      pin: pickFirst(transaction?.pin, transaction?.buyer_pin),
      buyerType: pickFirst(
        transaction?.buyer_type,
        transaction?.buyerType,
        receiptModel?.customer?.buyerType,
      ),
      odometer: pickFirst(transaction?.odometer),
      paymentType: pickFirst(
        transaction?.payment_type,
        transaction?.paymentType,
        receiptModel?.payment?.method,
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
        receiptModel?.payment?.currency,
        totalsSource?.currency,
        transaction?.currency,
        dbLines?.[0]?.currency,
        parsed?.currency,
        parsed?.details?.currency,
      ),
      discount: discountAmount,
      paymentMethod,
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
        receiptModel?.fiscalMeta?.verificationCode,
      ),
      fiscalQrCodeData: pickFirst(
        receipt?.fiscalQrCodeData,
        receipt?.fiscal_qr_code_data,
        receiptModel?.qrPayload?.data,
        receiptModel?.fiscalMeta?.verificationUrl,
      ),
      copyLabel:
        String(receiptModel?.station?.country ?? station?.country ?? '')
          .trim()
          .toUpperCase() === 'TZ'
          ? undefined
          : 'This is a COPY 1',
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
