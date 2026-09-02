import type { FiscalReceiptModel } from '@/src/shared/fiscalization/receipt/types'

export const RECEIPT_SNAPSHOT_SCHEMA_VERSION = 1 as const

export type ReceiptFiscalSnapshotV1 = {
  schemaVersion: typeof RECEIPT_SNAPSHOT_SCHEMA_VERSION
  reference: string | null
  receipt: {
    country: string | null
    companyName: string | null
    companyMobile: string | null
    companyTin: string | null
    companyVrn: string | null
    companySerial: string | null
    companyUin: string | null
    companyTaxOffice: string | null
    receiptNumber: string
    receiptZNumber: string | null
    receiptDate: string | null
    receiptTime: string | null
    receiptTraNumber: string | null
    receiptInternalData: string | null
    receiptSignature: string | null
    fiscalVerificationCode: string | null
    fiscalQrCodeData: string | null
    scuId: string | null
    cuInvoiceNo: string | null
  }
}

export type ReceiptBrandingSnapshotV1 = {
  schemaVersion: typeof RECEIPT_SNAPSHOT_SCHEMA_VERSION
  primaryColor: string | null
  secondaryColor: string | null
  stationDisplayName: string | null
  receiptHeaderText: string | null
  receiptFooterText: string | null
  logoPath: string | null
}

const nullableString = (value: unknown): string | null => {
  const normalized = String(value ?? '').trim()
  return normalized.length ? normalized : null
}

export function buildReceiptFiscalSnapshot(input: {
  model: FiscalReceiptModel
}): ReceiptFiscalSnapshotV1 {
  const { model } = input

  return {
    schemaVersion: RECEIPT_SNAPSHOT_SCHEMA_VERSION,
    reference: nullableString(model.transaction.fiscalReference),
    receipt: {
      country: nullableString(model.station.country),
      companyName: nullableString(model.station.name),
      companyMobile: nullableString(model.station.mobile),
      companyTin: nullableString(model.station.taxId),
      companyVrn: nullableString(model.station.vrn),
      companySerial: nullableString(model.station.serial),
      companyUin: nullableString(model.station.uin),
      companyTaxOffice: nullableString(model.station.taxOffice),
      receiptNumber: model.fiscalMeta.receiptNumber,
      receiptZNumber: nullableString(model.fiscalMeta.zNumber),
      receiptDate: nullableString(model.transaction.receiptDate),
      receiptTime: nullableString(model.transaction.receiptTime),
      receiptTraNumber: nullableString(model.fiscalMeta.traReceiptNumber),
      receiptInternalData: nullableString(model.fiscalMeta.internalData),
      receiptSignature: nullableString(model.fiscalMeta.signature),
      fiscalVerificationCode: nullableString(model.fiscalMeta.verificationCode),
      fiscalQrCodeData: nullableString(
        model.qrPayload?.data ?? model.fiscalMeta.verificationUrl,
      ),
      scuId: nullableString(model.fiscalMeta.scuId),
      cuInvoiceNo: nullableString(model.fiscalMeta.cuInvoiceNo),
    },
  }
}

export function buildReceiptBrandingSnapshot(input: {
  primaryColor?: unknown
  secondaryColor?: unknown
  stationDisplayName?: unknown
  receiptHeaderText?: unknown
  receiptFooterText?: unknown
  logoPath?: unknown
}): ReceiptBrandingSnapshotV1 {
  return {
    schemaVersion: RECEIPT_SNAPSHOT_SCHEMA_VERSION,
    primaryColor: nullableString(input.primaryColor),
    secondaryColor: nullableString(input.secondaryColor),
    stationDisplayName: nullableString(input.stationDisplayName),
    receiptHeaderText: nullableString(input.receiptHeaderText),
    receiptFooterText: nullableString(input.receiptFooterText),
    logoPath: nullableString(input.logoPath),
  }
}

export function normalizeReceiptBrandingSnapshot(
  value: unknown,
): ReceiptBrandingSnapshotV1 | null {
  let parsed = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const input = parsed as Record<string, unknown>

  const snapshot = buildReceiptBrandingSnapshot({
    primaryColor: input.primaryColor ?? input.primary_color,
    secondaryColor: input.secondaryColor ?? input.secondary_color,
    stationDisplayName: input.stationDisplayName ?? input.station_display_name,
    receiptHeaderText: input.receiptHeaderText ?? input.receipt_header_text,
    receiptFooterText: input.receiptFooterText ?? input.receipt_footer_text,
    logoPath: input.logoPath ?? input.logo_path,
  })

  return Object.entries(snapshot).some(
    ([key, entry]) => key !== 'schemaVersion' && entry !== null,
  )
    ? snapshot
    : null
}
