import { getTransactionDetailsRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction-read.repository'

import type { TanzaniaReceiptCounters } from './counters'
import { readSigningKeyPem, readTanzaniaFiscalConfig } from './config'
import {
  allocateFreshReceiptCounters,
  allocateReceiptCounters,
} from './counters'
import {
  getTraVerificationCode,
  getTraVerificationUrl,
} from './traVerification'
import { dateParts, numberText, signSha1Base64, xmlEscape, xmlTag } from './xml'

export type TraPaymentType = 'CASH' | 'CHEQUE' | 'EMONEY' | 'CCARD' | 'INVOICE'
export type TraVatRate = 'A' | 'B' | 'C' | 'D' | 'E'

export type TraReceiptItemRecord = {
  id: string
  description: string
  quantity: number
  taxCode: TraVatRate
  amount: string
  price: number
}

export type TraReceiptPaymentRecord = {
  type: TraPaymentType
  amount: string
}

export type TraReceiptTotalRecord = {
  totalExcludingTax: string
  totalIncludingTax: string
  discount: string
}

export type TraReceiptVatTotalRecord = {
  vatRate: TraVatRate
  vatRateText: string
  nettAmount: string
  taxAmount: string
  turnover: string
}

export type TraReceiptVfdConfig = {
  taxIdNo: string | null
  vfdRegId: string | null
  vfdSerialNo: string | null
  receiptCode: string | null
  customerIdType: string
  customerId?: string | null
  customerName?: string | null
  customerMobileNo?: string | null
}

export type TraReceiptPayload = {
  receiptNo: number
  dailyCount: number
  globalCount: number
  znum: string
  receiptVerificationNo: string
  verificationCode: string
  verificationUrl: string
  endpoint: string
  unsignedXml: string
  xml: string
  items: TraReceiptItemRecord[]
  totals: TraReceiptTotalRecord
  payments: TraReceiptPaymentRecord[]
  vatTotals: TraReceiptVatTotalRecord[]
}

function urlJoin(base: string, path: string) {
  const cleanBase = String(base || '')
    .trim()
    .replace(/\/+$/, '')
  const cleanPath = String(path || '')
    .trim()
    .replace(/^\/+/, '')
  return `${cleanBase}/${cleanPath}`
}

export function resolveTraReceiptEndpoint(baseUrl: string) {
  const cleanBase = String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
  if (!cleanBase) return ''
  if (/\/api\/efdmsrctinfo$/i.test(cleanBase)) return cleanBase
  if (/\/vfdtoken$/i.test(cleanBase)) {
    return cleanBase.replace(/\/vfdtoken$/i, '/api/efdmsRctInfo')
  }
  if (/\/api\/vfdregreq$/i.test(cleanBase)) {
    return cleanBase.replace(/\/api\/vfdregreq$/i, '/api/efdmsRctInfo')
  }
  if (/\/api\/efdmszreport$/i.test(cleanBase)) {
    return cleanBase.replace(/\/api\/efdmszreport$/i, '/api/efdmsRctInfo')
  }
  return urlJoin(cleanBase, 'api/efdmsRctInfo')
}

export function getTraReceiptVerificationNo(
  receiptCode: string | null | undefined,
  receiptNo: number | string,
) {
  const code = String(receiptCode || '').trim()
  return code ? `${code}${receiptNo}` : String(receiptNo)
}

export function normalizeTraTaxCode(
  value: unknown,
  fallback: TraVatRate = 'A',
): TraVatRate {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
  if (/^[A-E]$/.test(raw)) return raw as TraVatRate
  if (/^[1-5]$/.test(raw)) {
    return String.fromCharCode(64 + Number(raw)) as TraVatRate
  }
  return fallback
}

export function traTaxCodeNumber(value: unknown) {
  return normalizeTraTaxCode(value).toLowerCase().charCodeAt(0) - 96
}

export function normalizeTraPaymentType(value: unknown): TraPaymentType {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '')

  if (raw === 'CHEQUE' || raw === 'CHECK') return 'CHEQUE'
  if (raw === 'EMONEY' || raw === 'MOBILE' || raw === 'MOBILEMONEY') {
    return 'EMONEY'
  }
  if (
    raw === 'CCARD' ||
    raw === 'CARD' ||
    raw === 'CREDITCARD' ||
    raw === 'DEBITCARD'
  ) {
    return 'CCARD'
  }
  if (raw === 'INVOICE' || raw === 'ACCOUNT') return 'INVOICE'
  return 'CASH'
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function cleanText(value: unknown, fallback: string) {
  const text = String(value ?? '').trim()
  return text.length ? text : fallback
}

function lineDescription(line: any, fallback: string) {
  return cleanText(
    line?.mapped_description ??
      line?.product_name ??
      line?.source_product_name ??
      line?.description,
    fallback,
  )
}

function prefixDescription(description: string, prefix?: string | null) {
  const cleanDescription = cleanText(description, 'Fuel')
  const cleanPrefix = String(prefix || '').trim()
  return cleanPrefix ? `${cleanPrefix}${cleanDescription}` : cleanDescription
}

function lineAmount(line: any, quantity: number) {
  return firstNumber(
    line?.line_total,
    line?.lineTotal,
    line?.total_amount,
    line?.amount,
    Number(line?.unit_price ?? 0) * quantity,
  )
}

export function buildTraReceiptItemsFromTransaction(
  txn: any,
  opts?: { amountMultiplier?: number; descriptionPrefix?: string | null },
): TraReceiptItemRecord[] {
  const multiplier = Number.isFinite(Number(opts?.amountMultiplier))
    ? Number(opts?.amountMultiplier)
    : 1
  const fallbackTaxCode = normalizeTraTaxCode(
    txn?.mapped_tax_code ?? txn?.tax_code,
    'A',
  )
  const lines = Array.isArray(txn?.lines) ? txn.lines : []

  if (lines.length) {
    return lines.map((line: any, index: number) => {
      const quantity = firstNumber(line?.quantity, 1) || 1
      const price = lineAmount(line, quantity) * multiplier
      return {
        id: String(line?.id ?? index + 1),
        description: prefixDescription(
          lineDescription(line, txn?.fuel_type || txn?.grade_name || 'Fuel'),
          opts?.descriptionPrefix,
        ),
        quantity,
        taxCode: normalizeTraTaxCode(
          line?.mapped_tax_code ?? line?.tax_code,
          fallbackTaxCode,
        ),
        amount: numberText(price, 2),
        price,
      }
    })
  }

  const quantity = firstNumber(txn?.volume, txn?.quantity, 1) || 1
  const price = firstNumber(txn?.total_amount, txn?.totalAmount, 0) * multiplier
  return [
    {
      id: '1',
      description: prefixDescription(
        cleanText(txn?.fuel_type ?? txn?.grade_name, 'Fuel'),
        opts?.descriptionPrefix,
      ),
      quantity,
      taxCode: fallbackTaxCode,
      amount: numberText(price, 2),
      price,
    },
  ]
}

function taxRatePercentForCode(code: TraVatRate, vatRate: number) {
  if (code !== 'A') return 0
  return vatRate > 1 ? vatRate : vatRate * 100
}

export function buildTraReceiptVatTotals(args: {
  items: TraReceiptItemRecord[]
  vatRate: number
}): TraReceiptVatTotalRecord[] {
  const totals = new Map<TraVatRate, number>()
  for (const item of args.items) {
    totals.set(item.taxCode, (totals.get(item.taxCode) ?? 0) + item.price)
  }

  return Array.from(totals.entries()).map(([vatRate, gross]) => {
    const percent = taxRatePercentForCode(vatRate, args.vatRate)
    const divisor = 1 + percent / 100
    const nett = percent > 0 ? gross / divisor : gross
    const tax = gross - nett
    return {
      vatRate,
      vatRateText: `${vatRate}-${numberText(percent, 2)}`,
      nettAmount: numberText(nett, 2),
      taxAmount: numberText(tax, 2),
      turnover: numberText(gross, 2),
    }
  })
}

export function buildTraReceiptTotals(args: {
  items: TraReceiptItemRecord[]
  vatTotals: TraReceiptVatTotalRecord[]
  discount?: number
}): TraReceiptTotalRecord {
  const gross = args.items.reduce((acc, item) => acc + item.price, 0)
  const net = args.vatTotals.reduce(
    (acc, total) => acc + firstNumber(total.nettAmount),
    0,
  )
  return {
    totalExcludingTax: numberText(net, 2),
    totalIncludingTax: numberText(gross, 2),
    discount: numberText(args.discount ?? 0, 2),
  }
}

export function buildTraReceiptPayments(args: {
  transaction: any
  amount: number
}): TraReceiptPaymentRecord[] {
  const rawPayments = Array.isArray(args.transaction?.payments)
    ? args.transaction.payments
    : Array.isArray(args.transaction?.payment_records)
      ? args.transaction.payment_records
      : []

  if (rawPayments.length) {
    return rawPayments.map((payment: any) => ({
      type: normalizeTraPaymentType(payment?.type ?? payment?.payment_type),
      amount: numberText(
        firstNumber(payment?.amount, payment?.pmtAmount, args.amount),
        2,
      ),
    }))
  }

  return [
    {
      type: normalizeTraPaymentType(args.transaction?.payment_type),
      amount: numberText(args.amount, 2),
    },
  ]
}

export function buildTraReceiptPayloadString(payload: {
  date: string
  time: string
  znum: string
  receiptNo: number
  dailyCount: number
  globalCount: number
  receiptVerificationNo: string
  config: TraReceiptVfdConfig
  items: TraReceiptItemRecord[]
  totals: TraReceiptTotalRecord
  payments: TraReceiptPaymentRecord[]
  vatTotals: TraReceiptVatTotalRecord[]
}) {
  return (
    `<RCT>` +
    xmlTag('DATE', payload.date) +
    xmlTag('TIME', payload.time) +
    xmlTag('TIN', payload.config.taxIdNo) +
    xmlTag('REGID', payload.config.vfdRegId) +
    xmlTag('EFDSERIAL', payload.config.vfdSerialNo) +
    xmlTag('CUSTIDTYPE', payload.config.customerIdType) +
    xmlTag('CUSTID', payload.config.customerId ?? null) +
    xmlTag('CUSTNAME', payload.config.customerName ?? null) +
    xmlTag('MOBILENUM', payload.config.customerMobileNo ?? '') +
    xmlTag('RCTNUM', payload.receiptNo) +
    xmlTag('DC', payload.dailyCount) +
    xmlTag('GC', payload.globalCount) +
    xmlTag('ZNUM', payload.znum) +
    xmlTag('RCTVNUM', payload.receiptVerificationNo) +
    `<ITEMS>${payload.items
      .map(
        (item) =>
          `<ITEM>` +
          xmlTag('ID', item.id) +
          xmlTag('DESC', item.description) +
          xmlTag('QTY', numberText(item.quantity, 2)) +
          xmlTag('TAXCODE', traTaxCodeNumber(item.taxCode)) +
          xmlTag('AMT', numberText(item.price, 0)) +
          `</ITEM>`,
      )
      .join('')}</ITEMS>` +
    `<TOTALS>` +
    xmlTag('TOTALTAXEXCL', payload.totals.totalExcludingTax) +
    xmlTag('TOTALTAXINCL', payload.totals.totalIncludingTax) +
    xmlTag('DISCOUNT', payload.totals.discount) +
    `</TOTALS>` +
    `<PAYMENTS>${payload.payments
      .map(
        (payment) =>
          xmlTag('PMTTYPE', payment.type) + xmlTag('PMTAMOUNT', payment.amount),
      )
      .join('')}</PAYMENTS>` +
    `<VATTOTALS>${payload.vatTotals
      .map(
        (vatTotal) =>
          xmlTag('VATRATE', vatTotal.vatRate) +
          xmlTag('NETTAMOUNT', vatTotal.nettAmount) +
          xmlTag('TAXAMOUNT', vatTotal.taxAmount),
      )
      .join('')}</VATTOTALS>` +
    `</RCT>`
  )
}

export async function buildTraReceiptPayloadXml(args: {
  stationId: string
  payloadString: string
  skipSigningForDebug?: boolean
}) {
  let signature = ''
  if (!args.skipSigningForDebug) {
    const privateKeyPem = await readSigningKeyPem(args.stationId)
    if (!privateKeyPem) {
      throw new Error(
        'Tanzania TRA signing key is not configured in DB secure artifacts. Store a PEM private key as cert/private-key.pem or enable the Skip TRA/EWURA signing setting only for developer debugging.',
      )
    }
    signature = signSha1Base64(args.payloadString, privateKeyPem)
  }

  return {
    unsignedXml: args.payloadString,
    signature,
    xml: `<?xml version="1.0"?><EFDMS>${args.payloadString}<EFDMSSIGNATURE>${xmlEscape(signature)}</EFDMSSIGNATURE></EFDMS>`,
  }
}

export function readExistingCreditNoteCounters(
  creditNote: any,
): TanzaniaReceiptCounters | null {
  try {
    const response =
      typeof creditNote?.proxy_response === 'string'
        ? JSON.parse(creditNote.proxy_response)
        : creditNote?.proxy_response
    const traRoot = response?.localTanzania?.tra?.request?.tra
    const receiptNo = asPositiveInt(traRoot?.receiptNo)
    const globalCount = asPositiveInt(traRoot?.globalCount)
    const dailyCount = asPositiveInt(traRoot?.dailyCount)
    const znum = String(traRoot?.znum ?? '').trim()

    if (!receiptNo || !globalCount || !dailyCount || !znum) return null
    return { receiptNo, globalCount, dailyCount, znum }
  } catch {
    return null
  }
}

function asPositiveInt(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

export async function buildTraReceiptFromTransaction(args: {
  stationId: string
  transaction: any
  customer: any | null
  receiptDate?: unknown
  counterTransactionId?: string | null
  reuseTransactionCounters?: boolean
  existingCounters?: TanzaniaReceiptCounters | null
  amountMultiplier?: number
  descriptionPrefix?: string | null
}): Promise<TraReceiptPayload> {
  const cfg = await readTanzaniaFiscalConfig(args.stationId)
  if (!cfg.tra.baseUrl) {
    throw new Error(
      'Tanzania TRA base URL is not configured in DB (fiscal_config.config_json.data.traBaseUrl or vpos.tra.config.traBaseUrl). Environment variables are developer-only fallbacks.',
    )
  }

  const txn =
    (await getTransactionDetailsRepo(
      args.stationId,
      String(args.transaction.id),
    )) ?? args.transaction
  const dt = dateParts(
    args.receiptDate ??
      txn.transaction_date_time ??
      txn.transactionDateTime ??
      txn.created_at,
    cfg.station.timezone,
  )
  const counters =
    args.existingCounters ??
    (args.reuseTransactionCounters === false
      ? await allocateFreshReceiptCounters({
          stationId: args.stationId,
          znum: dt.compactDate,
        })
      : await allocateReceiptCounters({
          stationId: args.stationId,
          transactionId: String(args.counterTransactionId ?? txn.id),
          znum: dt.compactDate,
        }))

  const receiptVerificationNo = getTraReceiptVerificationNo(
    cfg.tra.receiptCode,
    counters.receiptNo,
  )
  const verificationCode = getTraVerificationCode(
    receiptVerificationNo,
    dt.time,
  )
  const verificationUrl = getTraVerificationUrl(
    receiptVerificationNo,
    dt.time,
    { baseUrl: cfg.tra.baseUrl },
  )
  const items = buildTraReceiptItemsFromTransaction(txn, {
    amountMultiplier: args.amountMultiplier,
    descriptionPrefix: args.descriptionPrefix,
  })
  const vatTotals = buildTraReceiptVatTotals({
    items,
    vatRate: cfg.settings.vatRate,
  })
  const totals = buildTraReceiptTotals({ items, vatTotals })
  const gross = items.reduce((acc, item) => acc + item.price, 0)
  const payments = buildTraReceiptPayments({ transaction: txn, amount: gross })
  const customer =
    args.customer ??
    (txn?.buyer_name || txn?.tin
      ? { buyer_name: txn.buyer_name, tin: txn.tin }
      : null)
  const customerTin = String(customer?.tin ?? customer?.pin ?? '').trim()
  const customerName = String(
    customer?.buyer_name ?? customer?.buyerName ?? customer?.name ?? '',
  ).trim()

  const unsignedXml = buildTraReceiptPayloadString({
    date: dt.isoDate,
    time: dt.time,
    znum: counters.znum,
    receiptNo: counters.receiptNo,
    dailyCount: counters.dailyCount,
    globalCount: counters.globalCount,
    receiptVerificationNo,
    config: {
      taxIdNo: cfg.tra.taxIdNo ?? cfg.ewura.registration?.OperatorTin,
      vfdRegId: cfg.tra.vfdRegId,
      vfdSerialNo: cfg.tra.vfdSerialNo,
      receiptCode: cfg.tra.receiptCode,
      customerIdType: cfg.tra.customerIdType,
      customerId: customerTin || null,
      customerName: customerName || null,
      customerMobileNo: customer?.mobile ?? customer?.phone ?? null,
    },
    items,
    totals,
    payments,
    vatTotals,
  })

  const xml = await buildTraReceiptPayloadXml({
    stationId: args.stationId,
    payloadString: unsignedXml,
    skipSigningForDebug: cfg.tra.skipSigningForDebug,
  })

  return {
    ...counters,
    receiptVerificationNo,
    verificationCode,
    verificationUrl,
    endpoint: resolveTraReceiptEndpoint(cfg.tra.baseUrl),
    unsignedXml,
    xml: xml.xml,
    items,
    totals,
    payments,
    vatTotals,
  }
}
