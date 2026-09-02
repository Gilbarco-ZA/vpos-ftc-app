import { queryOne } from '@/src/platform/db/postgres'

import type {
  TraPaymentType,
  TraReceiptPaymentRecord,
  TraReceiptVatTotalRecord,
  TraVatRate,
} from './traReceipt'
import {
  readCertSerial,
  readSigningKeyPem,
  readTanzaniaFiscalConfig,
} from './config'
import {
  markTraReportFailed,
  markTraReportSent,
  upsertTraReportPending,
} from './db'
import { getTraBearerToken } from './traAuth'
import { buildTraReceiptVatTotals, normalizeTraPaymentType } from './traReceipt'
import {
  dateParts,
  numberText,
  parseXmlTag,
  signSha1Base64,
  xmlEscape,
  xmlTag,
} from './xml'

export type TraZReportTotalsRecord = {
  dailyTotalAmount: string
  gross: string
  corrections: string
  discounts: string
  surcharges: string
  ticketsVoid: string
  ticketsVoidTotal: string
  ticketsFiscal: string
  ticketsNonFiscal: string
}

export type TraZReportChangeRecord = {
  vatChangeNo: number
  headChangeNo: number
}

export type TraZReportPayload = {
  reportDate: string
  znum: string
  reportNo: number
  endpoint: string
  unsignedXml: string
  xml: string
  totals: TraZReportTotalsRecord
  payments: TraReceiptPaymentRecord[]
  vatTotals: TraReceiptVatTotalRecord[]
  changes: TraZReportChangeRecord
}

export type TraZReportSummary = {
  reportDate?: string | null
  znum?: string | null
  dailyTotalAmount: number
  gross: number
  ticketsFiscal: number
  ticketsNonFiscal?: number
  ticketsVoid?: number
  ticketsVoidTotal?: number
  corrections?: number
  discounts?: number
  surcharges?: number
  payments?: Partial<Record<TraPaymentType, number>>
  vatTotals?: Array<{
    vatRate: TraVatRate
    nettAmount: number
    taxAmount: number
    turnover?: number
  }>
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

export function resolveTraZReportEndpoint(baseUrl: string) {
  const cleanBase = String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
  if (!cleanBase) return ''
  if (/\/api\/efdmszreport$/i.test(cleanBase)) return cleanBase
  if (/\/vfdtoken$/i.test(cleanBase)) {
    return cleanBase.replace(/\/vfdtoken$/i, '/api/efdmszreport')
  }
  if (/\/api\/efdmsrctinfo$/i.test(cleanBase)) {
    return cleanBase.replace(/\/api\/efdmsrctinfo$/i, '/api/efdmszreport')
  }
  if (/\/api\/vfdregreq$/i.test(cleanBase)) {
    return cleanBase.replace(/\/api\/vfdregreq$/i, '/api/efdmszreport')
  }
  return urlJoin(cleanBase, 'api/efdmszreport')
}

function cleanHeaderLine(value: unknown) {
  return String(value ?? '').trim()
}

function buildHeaderLines(args: {
  station: Awaited<ReturnType<typeof readTanzaniaFiscalConfig>>['station']
  registration: Record<string, any>
}) {
  const registrationHeader = args.registration?.Header
  if (Array.isArray(registrationHeader)) {
    const lines = registrationHeader.map(cleanHeaderLine).filter(Boolean)
    if (lines.length) return lines
  }

  return [
    args.registration?.OperatorName ?? args.station.name,
    args.station.address ? `PLOT:${args.station.address}` : args.station.city,
    args.station.phone ? `TEL NO:${args.station.phone}` : null,
    [args.station.city, args.station.country].filter(Boolean).join(','),
  ]
    .map(cleanHeaderLine)
    .filter(Boolean)
}

function paymentRecordsFromSummary(
  payments: Partial<Record<TraPaymentType, number>> | undefined,
  fallbackAmount: number,
): TraReceiptPaymentRecord[] {
  const orderedTypes: TraPaymentType[] = [
    'CASH',
    'CHEQUE',
    'CCARD',
    'EMONEY',
    'INVOICE',
  ]
  const source =
    payments && Object.keys(payments).length
      ? payments
      : { CASH: fallbackAmount }
  return orderedTypes.map((type) => ({
    type,
    amount: numberText(source[type] ?? 0, 2),
  }))
}

function vatTotalsFromSummary(args: {
  summary: TraZReportSummary
  vatRate: number
}): TraReceiptVatTotalRecord[] {
  if (args.summary.vatTotals?.length) {
    return args.summary.vatTotals.map((total) => {
      const vatRate = total.vatRate
      const pct =
        vatRate === 'A'
          ? args.vatRate > 1
            ? args.vatRate
            : args.vatRate * 100
          : 0
      const turnover = total.turnover ?? total.nettAmount + total.taxAmount
      return {
        vatRate,
        vatRateText: `${vatRate}-${numberText(pct, 2)}`,
        nettAmount: numberText(total.nettAmount, 2),
        taxAmount: numberText(total.taxAmount, 2),
        turnover: numberText(turnover, 2),
      }
    })
  }

  return buildTraReceiptVatTotals({
    vatRate: args.vatRate,
    items: [
      {
        id: '1',
        description: 'DAILY TOTAL',
        quantity: 1,
        taxCode: 'A',
        amount: numberText(args.summary.dailyTotalAmount, 2),
        price: args.summary.dailyTotalAmount,
      },
    ],
  })
}

export function buildTraZReportPayloadString(payload: {
  date: string
  time: string
  header: string[]
  config: {
    vatRegNo: string | null
    taxIdNo: string | null
    taxOffice: string | null
    vfdRegId: string | null
    vfdSerialNo: string | null
    registrationDate: string | null
    userIdNo: string | null
    simIMSI: string | null
  }
  znum: string
  totals: TraZReportTotalsRecord
  payments: TraReceiptPaymentRecord[]
  vatTotals: TraReceiptVatTotalRecord[]
  changes?: TraZReportChangeRecord | null
  firmwareVersion?: string | null
  firmwareChecksum?: string | null
}) {
  return (
    `<ZREPORT>` +
    xmlTag('DATE', payload.date) +
    xmlTag('TIME', payload.time) +
    `<HEADER>${payload.header.map((line) => xmlTag('LINE', line)).join('')}</HEADER>` +
    xmlTag('VRN', payload.config.vatRegNo) +
    xmlTag('TIN', payload.config.taxIdNo) +
    xmlTag('TAXOFFICE', payload.config.taxOffice) +
    xmlTag('REGID', payload.config.vfdRegId) +
    xmlTag('ZNUMBER', payload.znum) +
    xmlTag('EFDSERIAL', payload.config.vfdSerialNo) +
    xmlTag('REGISTRATIONDATE', payload.config.registrationDate) +
    xmlTag('USER', payload.config.userIdNo) +
    xmlTag('SIMIMSI', payload.config.simIMSI || 'WEBAPI') +
    `<TOTALS>` +
    xmlTag('DAILYTOTALAMOUNT', payload.totals.dailyTotalAmount) +
    xmlTag('GROSS', payload.totals.gross) +
    xmlTag('CORRECTIONS', payload.totals.corrections) +
    xmlTag('DISCOUNTS', payload.totals.discounts) +
    xmlTag('SURCHARGES', payload.totals.surcharges) +
    xmlTag('TICKETSVOID', payload.totals.ticketsVoid) +
    xmlTag('TICKETSVOIDTOTAL', payload.totals.ticketsVoidTotal) +
    xmlTag('TICKETSFISCAL', payload.totals.ticketsFiscal) +
    xmlTag('TICKETSNONFISCAL', payload.totals.ticketsNonFiscal) +
    `</TOTALS>` +
    `<VATTOTALS>${payload.vatTotals
      .map(
        (vatTotal) =>
          xmlTag('VATRATE', vatTotal.vatRateText) +
          xmlTag('NETTAMOUNT', vatTotal.nettAmount) +
          xmlTag('TAXAMOUNT', vatTotal.taxAmount),
      )
      .join('')}</VATTOTALS>` +
    `<PAYMENTS>${payload.payments
      .map(
        (payment) =>
          xmlTag('PMTTYPE', payment.type) + xmlTag('PMTAMOUNT', payment.amount),
      )
      .join('')}</PAYMENTS>` +
    `<CHANGES>` +
    xmlTag('VATCHANGENUM', payload.changes?.vatChangeNo ?? 0) +
    xmlTag('HEADCHANGENUM', payload.changes?.headChangeNo ?? 0) +
    `</CHANGES>` +
    `<ERRORS></ERRORS>` +
    xmlTag('FWVERSION', payload.firmwareVersion || '3.0') +
    xmlTag('FWCHECKSUM', payload.firmwareChecksum || 'WEBAPI') +
    `</ZREPORT>`
  )
}

async function signedEfdmsXml(args: {
  stationId: string
  payloadString: string
  skipSigningForDebug?: boolean
}) {
  let signature = ''
  if (!args.skipSigningForDebug) {
    const privateKeyPem = await readSigningKeyPem(args.stationId)
    if (!privateKeyPem) {
      throw new Error(
        'Tanzania TRA z-report signing key is not configured in DB secure artifacts. Store a PEM private key as cert/private-key.pem or enable the Skip TRA/EWURA signing setting only for developer debugging.',
      )
    }
    signature = signSha1Base64(args.payloadString, privateKeyPem)
  }
  return `<?xml version="1.0"?><EFDMS>${args.payloadString}<EFDMSSIGNATURE>${xmlEscape(signature)}</EFDMSSIGNATURE></EFDMS>`
}

function pickReg(reg: Record<string, any>, keys: string[], fallback?: unknown) {
  for (const key of keys) {
    const value = reg?.[key]
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return fallback == null ? null : String(fallback)
}

export async function buildTraZReportPayload(args: {
  stationId: string
  summary: TraZReportSummary
  reportDate?: unknown
}): Promise<TraZReportPayload> {
  const cfg = await readTanzaniaFiscalConfig(args.stationId)
  if (!cfg.tra.baseUrl) {
    throw new Error(
      'Tanzania TRA base URL is not configured in DB (fiscal_config.config_json.data.traBaseUrl or vpos.tra.config.traBaseUrl). Environment variables are developer-only fallbacks.',
    )
  }
  const dt = dateParts(
    args.reportDate ?? args.summary.reportDate ?? new Date(),
    cfg.station.timezone,
  )
  const znum = args.summary.znum ?? dt.compactDate
  const reportNo = Number(znum)
  const vatTotals = vatTotalsFromSummary({
    summary: args.summary,
    vatRate: cfg.settings.vatRate,
  })
  const payments = paymentRecordsFromSummary(
    args.summary.payments,
    args.summary.dailyTotalAmount,
  )
  const totals: TraZReportTotalsRecord = {
    dailyTotalAmount: numberText(args.summary.dailyTotalAmount, 2),
    gross: numberText(args.summary.gross, 2),
    corrections: numberText(args.summary.corrections ?? 0, 2),
    discounts: numberText(args.summary.discounts ?? 0, 2),
    surcharges: numberText(args.summary.surcharges ?? 0, 2),
    ticketsVoid: numberText(args.summary.ticketsVoid ?? 0, 0),
    ticketsVoidTotal: numberText(args.summary.ticketsVoidTotal ?? 0, 2),
    ticketsFiscal: numberText(args.summary.ticketsFiscal, 0),
    ticketsNonFiscal: numberText(args.summary.ticketsNonFiscal ?? 0, 0),
  }
  const reg = cfg.ewura.registration ?? {}
  const unsignedXml = buildTraZReportPayloadString({
    date: dt.isoDate,
    time: dt.time,
    header: buildHeaderLines({ station: cfg.station, registration: reg }),
    config: {
      vatRegNo: pickReg(reg, ['OperatorVrn', 'VRN', 'vatRegNo']),
      taxIdNo: cfg.tra.taxIdNo ?? pickReg(reg, ['OperatorTin', 'TIN']),
      taxOffice: pickReg(reg, ['TaxOffice', 'taxOffice'], cfg.station.city),
      vfdRegId: cfg.tra.vfdRegId,
      vfdSerialNo: cfg.tra.vfdSerialNo,
      registrationDate: pickReg(reg, ['RegistrationDate', 'registrationDate']),
      userIdNo: pickReg(reg, ['UserIdNo', 'userIdNo']),
      simIMSI: pickReg(reg, ['SIMIMSI', 'simIMSI'], 'WEBAPI'),
    },
    znum,
    totals,
    payments,
    vatTotals,
    changes: { vatChangeNo: 0, headChangeNo: 0 },
  })

  return {
    reportDate: dt.isoDate,
    znum,
    reportNo,
    endpoint: resolveTraZReportEndpoint(cfg.tra.baseUrl),
    unsignedXml,
    xml: await signedEfdmsXml({
      stationId: args.stationId,
      payloadString: unsignedXml,
      skipSigningForDebug: cfg.tra.skipSigningForDebug,
    }),
    totals,
    payments,
    vatTotals,
    changes: { vatChangeNo: 0, headChangeNo: 0 },
  }
}

export async function loadTraZReportSummaryFromDb(args: {
  stationId: string
  businessDate: string
  timezone?: string | null
}): Promise<TraZReportSummary> {
  const timezone = args.timezone || 'Africa/Dar_es_Salaam'
  const row = await queryOne<{
    daily_total_amount: string | number | null
    gross: string | number | null
    tickets_fiscal: string | number | null
    cash_total: string | number | null
    cheque_total: string | number | null
    card_total: string | number | null
    emoney_total: string | number | null
    invoice_total: string | number | null
  }>(
    `SELECT
        COALESCE(SUM(CASE
          WHEN (t.transaction_date_time AT TIME ZONE $3)::date = $2::date
          THEN t.total_amount ELSE 0 END), 0) AS daily_total_amount,
        COALESCE(SUM(CASE
          WHEN (t.transaction_date_time AT TIME ZONE $3)::date <= $2::date
          THEN t.total_amount ELSE 0 END), 0) AS gross,
        COUNT(*) FILTER (
          WHERE (t.transaction_date_time AT TIME ZONE $3)::date = $2::date
        ) AS tickets_fiscal,
        COALESCE(SUM(CASE WHEN (t.transaction_date_time AT TIME ZONE $3)::date = $2::date
          AND UPPER(COALESCE(t.payment_type, 'CASH')) IN ('CASH')
          THEN t.total_amount ELSE 0 END), 0) AS cash_total,
        COALESCE(SUM(CASE WHEN (t.transaction_date_time AT TIME ZONE $3)::date = $2::date
          AND UPPER(COALESCE(t.payment_type, '')) IN ('CHEQUE', 'CHECK')
          THEN t.total_amount ELSE 0 END), 0) AS cheque_total,
        COALESCE(SUM(CASE WHEN (t.transaction_date_time AT TIME ZONE $3)::date = $2::date
          AND UPPER(COALESCE(t.payment_type, '')) IN ('CARD', 'CCARD', 'CREDITCARD', 'DEBITCARD')
          THEN t.total_amount ELSE 0 END), 0) AS card_total,
        COALESCE(SUM(CASE WHEN (t.transaction_date_time AT TIME ZONE $3)::date = $2::date
          AND UPPER(COALESCE(t.payment_type, '')) IN ('EMONEY', 'MOBILE', 'MOBILEMONEY')
          THEN t.total_amount ELSE 0 END), 0) AS emoney_total,
        COALESCE(SUM(CASE WHEN (t.transaction_date_time AT TIME ZONE $3)::date = $2::date
          AND UPPER(COALESCE(t.payment_type, '')) IN ('INVOICE', 'ACCOUNT')
          THEN t.total_amount ELSE 0 END), 0) AS invoice_total
       FROM transactions t
      WHERE t.station_id = $1
        AND t.deleted_at IS NULL
        AND t.status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED')`,
    [args.stationId, args.businessDate, timezone],
  )

  const payments: Partial<Record<TraPaymentType, number>> = {
    CASH: Number(row?.cash_total ?? 0),
    CHEQUE: Number(row?.cheque_total ?? 0),
    CCARD: Number(row?.card_total ?? 0),
    EMONEY: Number(row?.emoney_total ?? 0),
    INVOICE: Number(row?.invoice_total ?? 0),
  }

  // Preserve package-compatible payment buckets but fold unknown/empty payment
  // values into CASH by using the daily total fallback if the explicit buckets are zero.
  const bucketTotal = Object.values(payments).reduce(
    (acc, amount) => acc + Number(amount ?? 0),
    0,
  )
  const dailyTotalAmount = Number(row?.daily_total_amount ?? 0)
  if (dailyTotalAmount && bucketTotal === 0) payments.CASH = dailyTotalAmount

  return {
    reportDate: args.businessDate,
    znum: args.businessDate.replace(/-/g, ''),
    dailyTotalAmount,
    gross: Number(row?.gross ?? dailyTotalAmount),
    ticketsFiscal: Number(row?.tickets_fiscal ?? 0),
    ticketsNonFiscal: 0,
    ticketsVoid: 0,
    ticketsVoidTotal: 0,
    corrections: 0,
    discounts: 0,
    surcharges: 0,
    payments,
  }
}

function parseTraZReportResponse(rawResponse: string) {
  const ackcode =
    parseXmlTag(rawResponse, 'ACKCODE') ??
    parseXmlTag(rawResponse, 'ackcode') ??
    parseXmlTag(rawResponse, 'ackCode')
  const ackmsg =
    parseXmlTag(rawResponse, 'ACKMSG') ??
    parseXmlTag(rawResponse, 'ackmsg') ??
    parseXmlTag(rawResponse, 'ackMessage')
  const znumber =
    parseXmlTag(rawResponse, 'ZNUMBER') ?? parseXmlTag(rawResponse, 'znumber')
  return { ackcode, ackmsg, znumber, raw: rawResponse }
}

function redactedHeaders(headers: Record<string, string>) {
  return {
    ...headers,
    Authorization: headers.Authorization ? 'bearer ***' : undefined,
  }
}

export async function sendTraZReportFromDb(args: {
  stationId: string
  businessDate: string
  sourceQueueId?: string | null
}) {
  const cfg = await readTanzaniaFiscalConfig(args.stationId)
  const summary = await loadTraZReportSummaryFromDb({
    stationId: args.stationId,
    businessDate: args.businessDate,
    timezone: cfg.station.timezone,
  })
  const payload = await buildTraZReportPayload({
    stationId: args.stationId,
    summary,
    reportDate: args.businessDate,
  })
  const token = await getTraBearerToken({
    stationId: args.stationId,
    baseUrl: cfg.tra.baseUrl!,
    username: cfg.tra.username,
    password: cfg.tra.password,
  })
  const certSerial =
    cfg.tra.certSerial ?? (await readCertSerial(args.stationId))
  const headers: Record<string, string> = {
    'content-type': 'Application/xml',
    Client: 'WEBAPI',
    'Routing-key': 'vfdzreport',
  }
  if (certSerial) headers['Cert-Serial'] = certSerial
  if (token) headers.Authorization = `bearer ${token}`

  const requestPayload = {
    traZReport: {
      reportDate: payload.reportDate,
      znum: payload.znum,
      reportNo: payload.reportNo,
    },
    endpoint: payload.endpoint,
    headers: redactedHeaders(headers),
    xml: payload.xml,
    unsignedXml: payload.unsignedXml,
    totals: payload.totals,
    payments: payload.payments,
    vatTotals: payload.vatTotals,
    changes: payload.changes,
  }
  const report = await upsertTraReportPending({
    stationId: args.stationId,
    reportDate: payload.reportDate,
    sourceQueueId: args.sourceQueueId ?? null,
    payload: requestPayload,
  })

  try {
    const response = await fetch(payload.endpoint, {
      method: 'POST',
      headers,
      body: payload.xml,
    })
    const rawResponse = await response.text().catch(() => '')
    const parsed = parseTraZReportResponse(rawResponse)
    const ok = response.ok && (parsed.ackcode == null || parsed.ackcode === '0')
    const responsePayload = { ...parsed, httpStatus: response.status }

    if (ok) {
      await markTraReportSent({
        stationId: args.stationId,
        id: report!.id,
        reference: parsed.znumber ?? payload.znum,
        response: responsePayload,
      })
    } else {
      await markTraReportFailed({
        stationId: args.stationId,
        id: report!.id,
        error: parsed.ackcode
          ? `TRA z-report returned ackcode ${parsed.ackcode}${parsed.ackmsg ? `: ${parsed.ackmsg}` : ''}`
          : `TRA z-report request failed (${response.status})`,
        response: responsePayload,
      })
    }

    return {
      ok,
      httpStatus: response.status,
      rawResponse,
      reference: parsed.znumber ?? payload.znum,
      request: requestPayload,
      response: responsePayload,
      error: ok
        ? null
        : parsed.ackcode
          ? `TRA z-report returned ackcode ${parsed.ackcode}${parsed.ackmsg ? `: ${parsed.ackmsg}` : ''}`
          : `TRA z-report request failed (${response.status})`,
    }
  } catch (e: any) {
    const error = String(e?.message || e)
    await markTraReportFailed({
      stationId: args.stationId,
      id: report!.id,
      error,
    })
    throw e
  }
}

export function summarizePaymentTypes(
  values: unknown[],
): Partial<Record<TraPaymentType, number>> {
  return values.reduce<Partial<Record<TraPaymentType, number>>>(
    (acc, value) => {
      const type = normalizeTraPaymentType(value)
      acc[type] = (acc[type] ?? 0) + 1
      return acc
    },
    {},
  )
}
