import { toNumberLoose as toNumber } from '@/src/shared/numbers'
import { toOptionalString } from '@/src/shared/strings'

export type ReceiptLineItem = {
  fuelType?: string | null
  volume?: number | null
  unitPrice?: number | null
  amount?: number | null
}

export type ReceiptTotals = {
  subtotal?: number | null
  tax?: number | null
  total?: number | null
}

export type ReceiptIdentifiers = {
  fiscalizationReference?: string | null
  posReference?: string | null
  cloudTransactionId?: string | null
  transactionDateTime?: string | null
}

export type ReceiptHeader = {
  name?: string | null
  address?: string | null
  contact?: string | null
}

export type ReceiptQr = {
  data?: string | null
  imageBase64?: string | null
  url?: string | null
}

export type ReceiptPayment = {
  method?: string | null
  reference?: string | null
}

export type ReceiptDto = {
  header: ReceiptHeader
  identifiers: ReceiptIdentifiers
  lineItems: ReceiptLineItem[]
  totals: ReceiptTotals
  payments?: ReceiptPayment[]
  qr?: ReceiptQr
  raw?: any
}

const extractReceiptSource = (raw: any) => {
  if (!raw || typeof raw !== 'object') return raw
  return (
    raw.receipt ||
    raw.receiptData ||
    raw.fiscalReceipt ||
    raw.data?.receipt ||
    raw.payload?.receipt ||
    raw
  )
}

export const normalizeReceipt = (opts: {
  transaction: any
  customer?: any
  transactionLines?: any[]
  raw?: any
}): ReceiptDto => {
  const { transaction, customer, transactionLines, raw } = opts
  const source = extractReceiptSource(raw)

  const headerSource = source?.station || source?.seller || source?.header || {}
  const header: ReceiptHeader = {
    name:
      toOptionalString(headerSource?.name) ||
      toOptionalString(headerSource?.stationName) ||
      toOptionalString(source?.station_name) ||
      toOptionalString(source?.stationName) ||
      null,
    address:
      toOptionalString(headerSource?.address) ||
      toOptionalString(headerSource?.location) ||
      toOptionalString(source?.station_address) ||
      null,
    contact:
      toOptionalString(headerSource?.contact) ||
      toOptionalString(headerSource?.phone) ||
      toOptionalString(source?.station_contact) ||
      null,
  }

  const identifiers: ReceiptIdentifiers = {
    fiscalizationReference: toOptionalString(
      transaction?.fiscalization_reference ||
        source?.fiscalization_reference ||
        source?.reference,
    ),
    posReference: toOptionalString(
      transaction?.pos_reference ||
        source?.pos_reference ||
        source?.posReference,
    ),
    cloudTransactionId: toOptionalString(
      transaction?.cloud_transaction_id ||
        source?.cloud_transaction_id ||
        source?.cloudTransactionId,
    ),
    transactionDateTime: toOptionalString(
      transaction?.transaction_date_time ||
        source?.transaction_date_time ||
        source?.transactionDateTime,
    ),
  }

  const dbLines: any[] = Array.isArray(transactionLines) ? transactionLines : []
  const itemsSource: any[] =
    source?.items || source?.lines || source?.lineItems || source?.details || []

  const lineItems: ReceiptLineItem[] = dbLines.length
    ? dbLines.map((line) => ({
        fuelType: toOptionalString(
          line?.product_name || line?.description || line?.fuel_type,
        ),
        volume: toNumber(line?.quantity || line?.volume),
        unitPrice: toNumber(line?.unit_price || line?.unitPrice || line?.price),
        amount: toNumber(line?.line_total || line?.amount || line?.total),
      }))
    : itemsSource.length
      ? itemsSource.map((item) => ({
          fuelType: toOptionalString(
            item?.fuel_type || item?.fuelType || item?.description,
          ),
          volume: toNumber(item?.volume || item?.quantity),
          unitPrice: toNumber(item?.unit_price || item?.unitPrice),
          amount: toNumber(item?.amount || item?.total || item?.lineTotal),
        }))
      : [
          {
            fuelType: toOptionalString(transaction?.fuel_type),
            volume: toNumber(transaction?.volume),
            unitPrice: toNumber(transaction?.unit_price),
            amount: toNumber(transaction?.total_amount),
          },
        ]

  const totalsSource = source?.totals || source?.summary || source || {}
  const totals: ReceiptTotals = {
    subtotal: toNumber(totalsSource?.subtotal || totalsSource?.sub_total),
    tax: toNumber(totalsSource?.tax || totalsSource?.tax_amount),
    total: toNumber(
      totalsSource?.total ||
        totalsSource?.grand_total ||
        transaction?.total_amount,
    ),
  }

  const paymentsSource: any[] = source?.payments || source?.payment || []
  const payments: ReceiptPayment[] = Array.isArray(paymentsSource)
    ? paymentsSource.map((p) => ({
        method: toOptionalString(p?.method || p?.paymentMethod),
        reference: toOptionalString(
          p?.reference || p?.ref || p?.paymentReference,
        ),
      }))
    : []

  const qrSource =
    source?.qr || source?.qrCode || source?.qr_code || source?.qrCodeImage
  const qr: ReceiptQr | undefined = qrSource
    ? {
        data: toOptionalString(
          qrSource?.data || qrSource?.value || qrSource?.payload || qrSource,
        ),
        imageBase64: toOptionalString(
          qrSource?.imageBase64 || qrSource?.image || null,
        ),
        url: toOptionalString(qrSource?.url || qrSource?.link || null),
      }
    : undefined

  const receipt: ReceiptDto = {
    header,
    identifiers,
    lineItems,
    totals,
    payments: payments.length ? payments : undefined,
    qr,
    raw: raw ?? null,
  }

  if (customer) {
    receipt.header = {
      ...receipt.header,
      name:
        receipt.header.name ||
        toOptionalString(customer?.buyer_name || customer?.buyerName),
    }
  }

  return receipt
}
