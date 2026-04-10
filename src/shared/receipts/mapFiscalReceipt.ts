import type { ReceiptTemplateModel } from './types'

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
  return v.length ? v : null
}

const pickFirst = (...values: any[]) => {
  for (const value of values) {
    const v = toStringSafe(value)
    if (v) return v
  }
  return null
}

const extractDetails = (raw: any) =>
  raw?.details ??
  raw?.data?.details ??
  raw?.payload?.details ??
  raw?.response?.details ??
  raw?.result?.details ??
  null

const extractReceipt = (raw: any, details: any) => {
  const receipt =
    details?.receipt ||
    raw?.receipt ||
    raw?.receiptData ||
    raw?.fiscalReceipt ||
    raw?.data?.receipt ||
    raw?.payload?.receipt ||
    raw?.data?.receiptData ||
    null

  if (receipt) return receipt

  const detailLike = details ?? raw?.details
  if (!detailLike) return null

  const hasReceiptFields =
    detailLike.receiptNumber ||
    detailLike.receiptDate ||
    detailLike.receiptTime ||
    detailLike.receiptInternalData ||
    detailLike.receiptSignature ||
    detailLike.fiscalVerificationCode ||
    detailLike.fiscalQrCodeData

  return hasReceiptFields ? detailLike : null
}

export const mapFiscalReceipt = (raw: any): ReceiptTemplateModel | null => {
  const parsed = safeParse(raw)
  if (!parsed) return null

  const details = extractDetails(parsed)
  const receipt = extractReceipt(parsed, details)

  const model: ReceiptTemplateModel = {
    documentId: pickFirst(
      parsed?.documentId,
      parsed?.document_id,
      details?.documentId,
      details?.document_id,
    ),
    documentNumber: pickFirst(
      details?.documentNumber,
      details?.document_number,
      parsed?.documentNumber,
      parsed?.document_number,
    ),
    documentType: pickFirst(
      details?.documentType,
      details?.document_type,
      parsed?.documentType,
      parsed?.document_type,
    ),
    isOnline: pickFirst(
      details?.isOnline,
      details?.is_online,
      parsed?.isOnline,
      parsed?.is_online,
    ),
    isFiscalized: pickFirst(
      details?.isFiscalized,
      details?.is_fiscalized,
      parsed?.isFiscalized,
      parsed?.is_fiscalized,
    ),
    companyName: pickFirst(
      receipt?.companyName,
      receipt?.company_name,
      receipt?.stationName,
      receipt?.station_name,
      receipt?.sellerName,
    ),
    companyMobile: pickFirst(
      receipt?.companyMobile,
      receipt?.company_mobile,
      receipt?.stationPhone,
      receipt?.station_phone,
      receipt?.phone,
    ),
    companyTin: pickFirst(
      receipt?.companyTin,
      receipt?.company_tin,
      receipt?.tin,
    ),
    companyVrn: pickFirst(
      receipt?.companyVrn,
      receipt?.company_vrn,
      receipt?.vrn,
    ),
    companySerial: pickFirst(
      receipt?.companySerial,
      receipt?.company_serial,
      receipt?.serial,
    ),
    companyTaxOffice: pickFirst(
      receipt?.companyTaxOffice,
      receipt?.company_tax_office,
    ),
    receiptNumber: pickFirst(
      receipt?.receiptNumber,
      receipt?.receipt_number,
      details?.receiptNumber,
      details?.receipt_number,
    ),
    receiptZNumber: pickFirst(
      receipt?.receiptZNumber,
      receipt?.receipt_z_number,
    ),
    receiptDate: pickFirst(receipt?.receiptDate, receipt?.receipt_date),
    receiptTime: pickFirst(receipt?.receiptTime, receipt?.receipt_time),
    receiptInternalData: pickFirst(
      receipt?.receiptInternalData,
      receipt?.receipt_internal_data,
      receipt?.internalData,
    ),
    receiptSignature: pickFirst(
      receipt?.receiptSignature,
      receipt?.receipt_signature,
      receipt?.signature,
    ),
    fiscalVerificationCode: pickFirst(
      receipt?.fiscalVerificationCode,
      receipt?.fiscal_verification_code,
      receipt?.verificationCode,
      receipt?.verification_code,
    ),
    fiscalQrCodeData: pickFirst(
      receipt?.fiscalQrCodeData,
      receipt?.fiscal_qr_code_data,
      receipt?.qrData,
      receipt?.qr_code,
    ),
  }

  const hasValue = Object.values(model).some(
    (value) => value !== null && value !== undefined,
  )
  return hasValue ? model : null
}
