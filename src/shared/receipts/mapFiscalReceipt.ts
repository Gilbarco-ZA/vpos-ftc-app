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
  raw?.Details ??
  raw?.data?.details ??
  raw?.data?.Details ??
  raw?.Data?.details ??
  raw?.Data?.Details ??
  raw?.payload?.details ??
  raw?.payload?.Details ??
  raw?.Payload?.details ??
  raw?.Payload?.Details ??
  raw?.response?.details ??
  raw?.response?.Details ??
  raw?.Response?.details ??
  raw?.Response?.Details ??
  raw?.result?.details ??
  raw?.result?.Details ??
  raw?.Result?.details ??
  raw?.Result?.Details ??
  (raw?.receipt || raw?.Receipt ? raw : null) ??
  null

const extractReceipt = (raw: any, details: any) => {
  const receipt =
    details?.receipt ||
    details?.Receipt ||
    raw?.receipt ||
    raw?.Receipt ||
    raw?.receiptData ||
    raw?.ReceiptData ||
    raw?.fiscalReceipt ||
    raw?.FiscalReceipt ||
    raw?.data?.receipt ||
    raw?.data?.Receipt ||
    raw?.Data?.receipt ||
    raw?.Data?.Receipt ||
    raw?.payload?.receipt ||
    raw?.payload?.Receipt ||
    raw?.Payload?.receipt ||
    raw?.Payload?.Receipt ||
    raw?.data?.receiptData ||
    raw?.Data?.ReceiptData ||
    null

  if (receipt) return receipt

  const detailLike = details ?? raw?.details ?? raw?.Details
  if (!detailLike) return null

  const hasReceiptFields =
    detailLike.receiptNumber ||
    detailLike.ReceiptNumber ||
    detailLike.receiptDate ||
    detailLike.ReceiptDate ||
    detailLike.receiptTime ||
    detailLike.ReceiptTime ||
    detailLike.receiptInternalData ||
    detailLike.ReceiptInternalData ||
    detailLike.receiptSignature ||
    detailLike.ReceiptSignature ||
    detailLike.fiscalVerificationCode ||
    detailLike.FiscalVerificationCode ||
    detailLike.fiscalQrCodeData ||
    detailLike.FiscalQrCodeData

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
      parsed?.DocumentId,
      parsed?.document_id,
      details?.documentId,
      details?.DocumentId,
      details?.document_id,
    ),
    documentNumber: pickFirst(
      details?.documentNumber,
      details?.DocumentNumber,
      details?.document_number,
      parsed?.documentNumber,
      parsed?.DocumentNumber,
      parsed?.document_number,
    ),
    documentType: pickFirst(
      details?.documentType,
      details?.DocumentType,
      details?.document_type,
      parsed?.documentType,
      parsed?.DocumentType,
      parsed?.document_type,
    ),
    isOnline: pickFirst(
      details?.isOnline,
      details?.IsOnline,
      details?.is_online,
      parsed?.isOnline,
      parsed?.IsOnline,
      parsed?.is_online,
    ),
    isFiscalized: pickFirst(
      details?.isFiscalized,
      details?.IsFiscalized,
      details?.is_fiscalized,
      parsed?.isFiscalized,
      parsed?.IsFiscalized,
      parsed?.is_fiscalized,
    ),
    companyName: pickFirst(
      receipt?.companyName,
      receipt?.CompanyName,
      receipt?.company_name,
      receipt?.stationName,
      receipt?.station_name,
      receipt?.sellerName,
    ),
    companyMobile: pickFirst(
      receipt?.companyMobile,
      receipt?.CompanyMobile,
      receipt?.company_mobile,
      receipt?.stationPhone,
      receipt?.station_phone,
      receipt?.phone,
    ),
    companyTin: pickFirst(
      receipt?.companyTin,
      receipt?.CompanyTin,
      receipt?.company_tin,
      receipt?.tin,
    ),
    companyVrn: pickFirst(
      receipt?.companyVrn,
      receipt?.CompanyVrn,
      receipt?.company_vrn,
      receipt?.vrn,
    ),
    companySerial: pickFirst(
      receipt?.companySerial,
      receipt?.CompanySerial,
      receipt?.company_serial,
      receipt?.serial,
    ),
    companyTaxOffice: pickFirst(
      receipt?.companyTaxOffice,
      receipt?.CompanyTaxOffice,
      receipt?.company_tax_office,
    ),
    receiptNumber: pickFirst(
      receipt?.receiptNumber,
      receipt?.ReceiptNumber,
      receipt?.receipt_number,
      details?.receiptNumber,
      details?.ReceiptNumber,
      details?.receipt_number,
    ),
    receiptZNumber: pickFirst(
      receipt?.receiptZNumber,
      receipt?.ReceiptZNumber,
      receipt?.receipt_z_number,
    ),
    receiptDate: pickFirst(
      receipt?.receiptDate,
      receipt?.ReceiptDate,
      receipt?.receipt_date,
    ),
    receiptTime: pickFirst(
      receipt?.receiptTime,
      receipt?.ReceiptTime,
      receipt?.receipt_time,
    ),
    receiptInternalData: pickFirst(
      receipt?.receiptInternalData,
      receipt?.ReceiptInternalData,
      receipt?.receipt_internal_data,
      receipt?.internalData,
    ),
    receiptSignature: pickFirst(
      receipt?.receiptSignature,
      receipt?.ReceiptSignature,
      receipt?.receipt_signature,
      receipt?.signature,
    ),
    fiscalVerificationCode: pickFirst(
      receipt?.fiscalVerificationCode,
      receipt?.FiscalVerificationCode,
      receipt?.fiscal_verification_code,
      receipt?.verificationCode,
      receipt?.verification_code,
    ),
    fiscalQrCodeData: pickFirst(
      receipt?.fiscalQrCodeData,
      receipt?.FiscalQrCodeData,
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
