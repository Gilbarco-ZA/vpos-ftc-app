import { queryAll } from '@/src/platform/db/postgres'

import {
  resolveTanzaniaSigningBundle,
  signXmlSha1Base64,
  verifyXmlSha1Base64,
} from './certificates'
import { readTanzaniaFiscalConfig } from './config'
import {
  markEwuraRegistrationFailed,
  markEwuraRegistrationSent,
  markEwuraReportFailed,
  markEwuraReportSent,
  markEwuraTransactionFailed,
  markEwuraTransactionSent,
  upsertEwuraCreditNotePending,
  upsertEwuraRegistrationPending,
  upsertEwuraReportPending,
  upsertEwuraTransactionPending,
} from './db'
import { dateParts, parseXmlTag, xmlEscape, xmlTag } from './xml'

type EwuraSendResult = {
  ok: boolean
  reference?: string | null
  rawResponse: string
  responsePayload: any
  error?: string | null
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

function num(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeFuelName(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return 'FUEL'
  return text.toUpperCase()
}

function pickReg(reg: Record<string, any>, key: string, fallback?: unknown) {
  const value = reg?.[key]
  const text = value == null ? '' : String(value).trim()
  return text || (fallback == null ? '' : String(fallback))
}

export type EwuraPayloadType = 'registration' | 'sales' | 'inventory'

export const EWURA_ENDPOINTS: Record<EwuraPayloadType, string> = {
  registration: '/RegisterRetailStationRecords',
  sales: '/PostRetailSalesTran',
  inventory: '/PostDailyStationInvSumTran',
}

const EWURA_ROOTS: Record<EwuraPayloadType, string> = {
  registration: 'RetailStationRegistration',
  sales: 'RetailerSaleTransaction',
  inventory: 'StationDaySummaryReport',
}

export function resolveEwuraEndpoint(baseUrl: string, type: EwuraPayloadType) {
  return urlJoin(baseUrl, EWURA_ENDPOINTS[type])
}

export function objectToXml(root: string, obj: Record<string, any>): string {
  const body = Object.entries(obj)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value
          .map((item) =>
            item && typeof item === 'object'
              ? objectToXml(key, item as Record<string, any>)
              : xmlTag(key, item),
          )
          .join('')
      }
      if (value && typeof value === 'object') {
        return objectToXml(key, value as Record<string, any>)
      }
      return xmlTag(key, value)
    })
    .join('')
  return `<${root}>${body}</${root}>`
}

export function buildEwuraNpgisPayloadXml(args: {
  type: EwuraPayloadType
  apiSourceId: string
  data: Record<string, any>
  signature?: string | null
}): { contentXml: string; xml: string; rootElement: string } {
  const rootElement = EWURA_ROOTS[args.type]
  const data = {
    ...args.data,
    APISourceId: args.data.APISourceId || args.apiSourceId,
  }
  const contentXml = objectToXml(rootElement, data)
  const xml = `<?xml version="1.0" encoding="UTF-8"?><NPGIS>${contentXml}<VendorSignature>${xmlEscape(args.signature ?? '')}</VendorSignature></NPGIS>`
  return { contentXml, xml, rootElement }
}

export async function buildSignedEwuraNpgisXml(args: {
  stationId?: string
  type: EwuraPayloadType
  apiSourceId: string
  data: Record<string, any>
  skipSigningForDebug?: boolean
  privateKeyPem?: string | null
  passphrase?: string | null
}) {
  const unsigned = buildEwuraNpgisPayloadXml({
    type: args.type,
    apiSourceId: args.apiSourceId,
    data: args.data,
  })

  let signature = ''
  let signingWarnings: string[] = []
  let privateKeyPem = args.privateKeyPem ?? null
  let passphrase = args.passphrase ?? null

  if (!privateKeyPem && args.stationId) {
    const bundle = await resolveTanzaniaSigningBundle({
      stationId: args.stationId,
      kind: 'ewura',
    })
    privateKeyPem = bundle.privateKeyPem
    passphrase = passphrase ?? bundle.passphrase
    signingWarnings = bundle.warnings
  }

  if (!args.skipSigningForDebug) {
    if (!privateKeyPem) {
      throw new Error(
        'Tanzania EWURA signing key is not configured in secure artifacts. Store a PEM private key as ewura/private-key.pem or cert/private-key.pem, or enable TZ_FISCAL_SKIP_SIGNING only for developer debugging.',
      )
    }
    signature = signXmlSha1Base64({
      payload: unsigned.contentXml,
      privateKeyPem,
      passphrase,
    })
  }

  return {
    ...buildEwuraNpgisPayloadXml({
      type: args.type,
      apiSourceId: args.apiSourceId,
      data: args.data,
      signature,
    }),
    signature,
    signingWarnings,
  }
}

async function buildSignedNpgisXml(args: {
  stationId: string
  type: 'sales' | 'inventory' | 'registration'
  data: Record<string, any>
  apiSourceId: string
  skipSigningForDebug: boolean
}) {
  return (
    await buildSignedEwuraNpgisXml({
      stationId: args.stationId,
      type: args.type,
      apiSourceId: args.apiSourceId,
      data: args.data,
      skipSigningForDebug: args.skipSigningForDebug,
    })
  ).xml
}

function extractXmlBlock(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'i')
  return re.exec(String(xml || ''))?.[0] ?? null
}

export function parseEwuraResponseXml(raw: string) {
  const code = parseXmlTag(raw, 'Code') ?? parseXmlTag(raw, 'code')
  const message = parseXmlTag(raw, 'Message') ?? parseXmlTag(raw, 'message')
  const transactionId =
    parseXmlTag(raw, 'TranId') ??
    parseXmlTag(raw, 'transactionId') ??
    parseXmlTag(raw, 'TransactionId')
  const requestName = parseXmlTag(raw, 'RequestName') ?? null
  const signature =
    parseXmlTag(raw, 'EwuraSignature') ??
    parseXmlTag(raw, 'VendorSignature') ??
    null
  return {
    code,
    message,
    transactionId,
    requestName,
    signature,
    responseXml: extractXmlBlock(raw, 'Response'),
    raw,
  }
}

export function verifyEwuraResponseSignature(args: {
  rawResponse: string
  publicKeyPem?: string | null
  certificatePem?: string | null
}) {
  const parsed = parseEwuraResponseXml(args.rawResponse)
  if (!parsed.signature || !parsed.responseXml) return false
  return verifyXmlSha1Base64({
    payload: parsed.responseXml,
    signature: parsed.signature,
    publicKeyPem: args.publicKeyPem,
    certificatePem: args.certificatePem,
  })
}

function parseEwuraResponse(raw: string) {
  return parseEwuraResponseXml(raw)
}

export async function postEwuraXml(args: {
  baseUrl: string
  endpoint: string
  xml: string
}): Promise<EwuraSendResult> {
  const url = urlJoin(args.baseUrl, args.endpoint)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/xml' },
    body: args.xml,
  })
  const raw = await response.text().catch(() => '')
  const parsed = parseEwuraResponse(raw)
  const ok = response.ok && (!parsed.code || parsed.code === '200')
  return {
    ok,
    reference: parsed.transactionId ?? null,
    rawResponse: raw,
    responsePayload: { ...parsed, httpStatus: response.status },
    error: ok
      ? null
      : `EWURA request failed (${response.status})${parsed.message ? `: ${parsed.message}` : ''}`,
  }
}

export function buildEwuraRegistrationRecord(args: {
  cfg: Awaited<ReturnType<typeof readTanzaniaFiscalConfig>>
  overrides?: Record<string, any> | null
}) {
  const { cfg } = args
  const reg = {
    ...(cfg.ewura.registration ?? {}),
    ...(args.overrides ?? {}),
  }

  return {
    TranId: num(reg.TranId ?? reg.tranId, 1),
    APISourceId: cfg.ewura.apiSourceId,
    EWURALicenseNo: cfg.ewura.licenseNo,
    RetailStationName: pickReg(reg, 'RetailStationName', cfg.station.name),
    OperatorTin: pickReg(reg, 'OperatorTin', cfg.tra.taxIdNo),
    OperatorVrn: pickReg(reg, 'OperatorVrn'),
    OperatorName: pickReg(reg, 'OperatorName', cfg.station.name),
    LicenseeTraSerialNo: pickReg(
      reg,
      'LicenseeTraSerialNo',
      cfg.tra.vfdSerialNo,
    ),
    RegionName: pickReg(reg, 'RegionName', cfg.station.city ?? ''),
    DistrictName: pickReg(reg, 'DistrictName', cfg.station.city ?? ''),
    WardName: pickReg(reg, 'WardName', cfg.station.city ?? ''),
    Zone: pickReg(reg, 'Zone'),
    ContactPersonEmailAddress: pickReg(
      reg,
      'ContactPersonEmailAddress',
      cfg.station.email ?? '',
    ),
    ContactPersonPhone: pickReg(
      reg,
      'ContactPersonPhone',
      cfg.station.phone ?? '',
    ),
  }
}

export async function sendEwuraRegistrationFromConfig(args: {
  stationId: string
  overrides?: Record<string, any> | null
}): Promise<EwuraSendResult & { requestPayload: any }> {
  const cfg = await readTanzaniaFiscalConfig(args.stationId)
  if (!cfg.ewura.baseUrl) {
    throw new Error(
      'EWURA base URL is not configured in DB (ewura_config.config_json.baseUrl or env:EWURA_BASE_URL).',
    )
  }
  if (!cfg.ewura.apiSourceId || !cfg.ewura.licenseNo) {
    throw new Error(
      'EWURA apiSourceId and licenseNo are required in ewura_config.',
    )
  }

  const registration = buildEwuraRegistrationRecord({
    cfg,
    overrides: args.overrides,
  })
  const xml = await buildSignedNpgisXml({
    stationId: args.stationId,
    type: 'registration',
    apiSourceId: cfg.ewura.apiSourceId,
    data: registration,
    skipSigningForDebug: cfg.ewura.skipSigningForDebug,
  })
  const row = await upsertEwuraRegistrationPending({
    stationId: args.stationId,
    payload: {
      ewuraType: 'registration',
      endpoint: EWURA_ENDPOINTS.registration,
      request: registration,
      xml,
    },
  })

  try {
    const result = await postEwuraXml({
      baseUrl: cfg.ewura.baseUrl,
      endpoint: EWURA_ENDPOINTS.registration,
      xml,
    })
    if (result.ok) {
      await markEwuraRegistrationSent({
        stationId: args.stationId,
        id: row!.id,
        response: result.responsePayload,
      })
    } else {
      await markEwuraRegistrationFailed({
        stationId: args.stationId,
        id: row!.id,
        error: result.error || 'EWURA registration failed',
        response: result.responsePayload,
      })
    }
    return {
      ...result,
      requestPayload: { ewuraRegistration: registration, xml },
    }
  } catch (e: any) {
    const error = String(e?.message || e)
    await markEwuraRegistrationFailed({
      stationId: args.stationId,
      id: row!.id,
      error,
    })
    throw e
  }
}

function buildSalesTransaction(args: {
  cfg: Awaited<ReturnType<typeof readTanzaniaFiscalConfig>>
  transaction: any
  customer: any | null
  traRequest: any
}) {
  const { cfg, transaction, traRequest } = args
  const reg = cfg.ewura.registration ?? {}
  const dt = dateParts(
    transaction.transaction_date_time ?? transaction.transactionDateTime,
    cfg.station.timezone,
  )
  const volume = num(transaction.volume, 0) || 1
  const amount = num(transaction.total_amount ?? transaction.totalAmount, 0)
  const buyerName = String(
    args.customer?.buyer_name ??
      args.customer?.buyerName ??
      args.customer?.name ??
      transaction.buyer_name ??
      'NIL',
  ).trim()

  return {
    TranId: num(
      traRequest?.tra?.receiptNo,
      num(transaction.doms_trans_seq_no, 1),
    ),
    APISourceId: cfg.ewura.apiSourceId,
    EWURALicenseNo: cfg.ewura.licenseNo,
    RctVerificationCode:
      traRequest?.tra?.receiptVerificationNo ??
      transaction.fiscalization_reference,
    RctDate: dt.slashDate,
    RctTime: dt.time,
    OperatorTin: pickReg(reg, 'OperatorTin', cfg.tra.taxIdNo),
    OperatorVrn: pickReg(reg, 'OperatorVrn'),
    OperatorName: pickReg(reg, 'OperatorName', cfg.station.name),
    RetailStationName: pickReg(reg, 'RetailStationName', cfg.station.name),
    TraSerialNo: cfg.tra.vfdSerialNo ?? pickReg(reg, 'LicenseeTraSerialNo'),
    ProductName: normalizeFuelName(
      transaction.fuel_type ?? transaction.grade_name,
    ),
    UnitPrice: volume > 0 ? amount / volume : amount,
    Volume: volume,
    Amount: amount,
    DiscountAmount: 0,
    AmountNew: amount,
    BuyerName: buyerName || 'NIL',
    CardDesc: String(transaction.payment_type || 'CASH').toUpperCase(),
    RegionName: pickReg(reg, 'RegionName', cfg.station.city ?? ''),
    DistrictName: pickReg(reg, 'DistrictName', cfg.station.city ?? ''),
    WardName: pickReg(reg, 'WardName', cfg.station.city ?? ''),
  }
}

export async function sendEwuraSalesTransactionFromDb(args: {
  stationId: string
  transaction: any
  customer: any | null
  traRequest: any
}): Promise<EwuraSendResult & { requestPayload: any }> {
  const cfg = await readTanzaniaFiscalConfig(args.stationId)
  if (!cfg.ewura.baseUrl) {
    throw new Error(
      'EWURA base URL is not configured in DB (ewura_config.config_json.baseUrl or env:EWURA_BASE_URL).',
    )
  }
  if (!cfg.ewura.apiSourceId || !cfg.ewura.licenseNo) {
    throw new Error(
      'EWURA apiSourceId and licenseNo are required in ewura_config.',
    )
  }

  const sales = buildSalesTransaction({
    cfg,
    transaction: args.transaction,
    customer: args.customer,
    traRequest: args.traRequest,
  })
  const xml = await buildSignedNpgisXml({
    stationId: args.stationId,
    type: 'sales',
    data: sales,
    apiSourceId: cfg.ewura.apiSourceId,
    skipSigningForDebug: cfg.ewura.skipSigningForDebug,
  })
  const row = await upsertEwuraTransactionPending({
    stationId: args.stationId,
    transactionId: String(args.transaction.id),
    payload: {
      ewuraType: 'sales',
      endpoint: EWURA_ENDPOINTS.sales,
      request: sales,
      xml,
    },
  })

  try {
    const result = await postEwuraXml({
      baseUrl: cfg.ewura.baseUrl,
      endpoint: EWURA_ENDPOINTS.sales,
      xml,
    })
    if (result.ok) {
      await markEwuraTransactionSent({
        stationId: args.stationId,
        id: row!.id,
        reference: result.reference,
        response: result.responsePayload,
      })
    } else {
      await markEwuraTransactionFailed({
        stationId: args.stationId,
        id: row!.id,
        error: result.error || 'EWURA sales transaction failed',
        response: result.responsePayload,
      })
    }
    return { ...result, requestPayload: { ewuraSales: sales, xml } }
  } catch (e: any) {
    const error = String(e?.message || e)
    await markEwuraTransactionFailed({
      stationId: args.stationId,
      id: row!.id,
      error,
    })
    throw e
  }
}

export async function sendEwuraCreditNoteFromDb(args: {
  stationId: string
  transaction: any
  customer: any | null
  creditNote: any
  traRequest: any
}): Promise<EwuraSendResult & { requestPayload: any }> {
  const cfg = await readTanzaniaFiscalConfig(args.stationId)
  if (!cfg.ewura.baseUrl) {
    throw new Error(
      'EWURA base URL is not configured in DB (ewura_config.config_json.baseUrl or env:EWURA_BASE_URL).',
    )
  }
  if (!cfg.ewura.apiSourceId || !cfg.ewura.licenseNo) {
    throw new Error(
      'EWURA apiSourceId and licenseNo are required in ewura_config.',
    )
  }

  const amount = Math.abs(
    num(args.transaction.total_amount ?? args.transaction.totalAmount, 0),
  )
  const creditTransaction = {
    ...args.transaction,
    transaction_date_time: args.creditNote?.created_at ?? new Date(),
    total_amount: amount * -1,
    totalAmount: amount * -1,
    fuel_type:
      args.transaction.fuel_type ?? args.transaction.grade_name ?? 'Fuel',
  }
  const sales = buildSalesTransaction({
    cfg,
    transaction: creditTransaction,
    customer: args.customer,
    traRequest: args.traRequest,
  })
  const xml = await buildSignedNpgisXml({
    stationId: args.stationId,
    type: 'sales',
    data: sales,
    apiSourceId: cfg.ewura.apiSourceId,
    skipSigningForDebug: cfg.ewura.skipSigningForDebug,
  })
  const row = await upsertEwuraCreditNotePending({
    stationId: args.stationId,
    creditNoteId: String(args.creditNote.id),
    originalTransactionId: String(args.transaction.id),
    payload: {
      ewuraType: 'creditNote',
      endpoint: EWURA_ENDPOINTS.sales,
      request: sales,
      xml,
    },
  })

  try {
    const result = await postEwuraXml({
      baseUrl: cfg.ewura.baseUrl,
      endpoint: EWURA_ENDPOINTS.sales,
      xml,
    })
    if (result.ok) {
      await markEwuraTransactionSent({
        stationId: args.stationId,
        id: row!.id,
        reference: result.reference,
        response: result.responsePayload,
      })
    } else {
      await markEwuraTransactionFailed({
        stationId: args.stationId,
        id: row!.id,
        error: result.error || 'EWURA credit note transaction failed',
        response: result.responsePayload,
      })
    }
    return { ...result, requestPayload: { ewuraCreditNote: sales, xml } }
  } catch (e: any) {
    const error = String(e?.message || e)
    await markEwuraTransactionFailed({
      stationId: args.stationId,
      id: row!.id,
      error,
    })
    throw e
  }
}

async function aggregateInventorySummary(args: {
  stationId: string
  payload: any
}) {
  const cfg = await readTanzaniaFiscalConfig(args.stationId)
  const reportDate = String(
    args.payload?.reportDate ??
      args.payload?.report_date ??
      args.payload?.date ??
      '',
  ).trim()
  const date = reportDate || dateParts(new Date(), cfg.station.timezone).isoDate
  const start = `${date}T00:00:00`
  const end = `${date}T23:59:59`
  const reg = cfg.ewura.registration ?? {}

  const [rows, tanks] = await Promise.all([
    queryAll<any>(
      `SELECT COALESCE(fuel_type, grade_name, 'FUEL') AS fuel,
              COUNT(*)::int AS count,
              COALESCE(SUM(volume), 0)::numeric AS volume,
              COALESCE(SUM(total_amount), 0)::numeric AS amount
         FROM transactions
        WHERE station_id = $1
          AND deleted_at IS NULL
          AND transaction_date_time >= $2::timestamptz
          AND transaction_date_time <= $3::timestamptz
          AND status IN ('FISCALIZED','PRINTED','REPRINTED')
        GROUP BY COALESCE(fuel_type, grade_name, 'FUEL')`,
      [args.stationId, start, end],
    ),
    queryAll<any>(
      `SELECT COALESCE(t.doms_tank_id, t.code, t.id::text) AS tank_id,
              COALESCE(p.product_name, t.name) AS product_name,
              COALESCE(t.live_volume_litres, t.manual_volume_litres, 0)::numeric AS volume
         FROM tanks t
         LEFT JOIN products p ON p.id = t.product_id
        WHERE t.station_id = $1 AND t.status = 'ACTIVE'
        ORDER BY t.code ASC`,
      [args.stationId],
    ),
  ])

  const byName = new Map(rows.map((row) => [normalizeFuelName(row.fuel), row]))
  const petrol = byName.get('PETROL') ?? byName.get('UNLEADED') ?? null
  const diesel = byName.get('DIESEL') ?? null
  const kerosene = byName.get('KEROSENE') ?? null
  const totalAmount = rows.reduce((sum, row) => sum + num(row.amount), 0)
  const totalVolume = rows.reduce((sum, row) => sum + num(row.volume), 0)
  const totalCount = rows.reduce((sum, row) => sum + num(row.count), 0)
  const reportNo = String(
    args.payload?.reportNo ?? args.payload?.report_no ?? date.replace(/-/g, ''),
  )

  return {
    TranId: num(args.payload?.tranId ?? args.payload?.TranId, 1),
    APISourceId: cfg.ewura.apiSourceId,
    EWURALicenseNo: cfg.ewura.licenseNo,
    RetailStationName: pickReg(reg, 'RetailStationName', cfg.station.name),
    SerialNo: cfg.tra.vfdSerialNo ?? pickReg(reg, 'LicenseeTraSerialNo'),
    ReportId: reportNo,
    ReportNo: reportNo,
    StartDate: `${date} 00:00:00`,
    EndDate: `${date} 23:59:59`,
    CountOfTrasactions: totalCount,
    TotalAmount: totalAmount,
    TotalDiscount: 0,
    TotalNetAmount: totalAmount,
    TotalVolume: totalVolume,
    TotalPetrol: num(petrol?.volume),
    TotalDiesel: num(diesel?.volume),
    TotalKerosene: num(kerosene?.volume),
    TRNPetrol: num(petrol?.count),
    TRNDiesel: num(diesel?.count),
    TRNKerosene: num(kerosene?.count),
    UnitPricePetrol: num(petrol?.volume)
      ? num(petrol?.amount) / num(petrol?.volume)
      : 0,
    UnitPriceDiesel: num(diesel?.volume)
      ? num(diesel?.amount) / num(diesel?.volume)
      : 0,
    UnitPriceKerosene: num(kerosene?.volume)
      ? num(kerosene?.amount) / num(kerosene?.volume)
      : 0,
    PetrolTotalAmount: num(petrol?.amount),
    DieselTotalAmount: num(diesel?.amount),
    KeroseneTotalAmount: num(kerosene?.amount),
    RegionName: pickReg(reg, 'RegionName', cfg.station.city ?? ''),
    DistrictName: pickReg(reg, 'DistrictName', cfg.station.city ?? ''),
    WardName: pickReg(reg, 'WardName', cfg.station.city ?? ''),
    TotalNoTanks: tanks.length,
    TankInventory: {
      Tank: tanks.map((tank) => ({
        TankID: tank.tank_id,
        TankProdName: tank.product_name,
        SaleNumber: 0,
        StartVolume: num(tank.volume),
        ATGDeliveryVolume: 0,
        SaleVolume: 0,
        MeasuredEndVolume: num(tank.volume),
        CalculatedEndVolume: num(tank.volume),
        VolumeDifference: 0,
      })),
    },
  }
}

export async function sendEwuraInventoryReportFromDb(args: {
  stationId: string
  payload: any
  sourceQueueId?: string | null
}) {
  const cfg = await readTanzaniaFiscalConfig(args.stationId)
  if (!cfg.ewura.baseUrl) {
    return {
      ok: false as const,
      error: 'EWURA base URL is not configured in DB.',
      retryable: false,
    }
  }
  if (!cfg.ewura.apiSourceId || !cfg.ewura.licenseNo) {
    return {
      ok: false as const,
      error: 'EWURA apiSourceId and licenseNo are required in ewura_config.',
      retryable: false,
    }
  }

  const summary =
    args.payload?.ewura ??
    args.payload?.inventorySummary ??
    args.payload?.StationDaySummaryReport ??
    (await aggregateInventorySummary(args))

  if (!summary.APISourceId) summary.APISourceId = cfg.ewura.apiSourceId
  if (!summary.EWURALicenseNo) summary.EWURALicenseNo = cfg.ewura.licenseNo

  const reportDate = String(
    args.payload?.reportDate ??
      args.payload?.report_date ??
      args.payload?.date ??
      (summary.StartDate ? String(summary.StartDate).slice(0, 10) : ''),
  ).trim()

  const xml = await buildSignedNpgisXml({
    stationId: args.stationId,
    type: 'inventory',
    data: summary,
    apiSourceId: cfg.ewura.apiSourceId,
    skipSigningForDebug: cfg.ewura.skipSigningForDebug,
  })
  const row = await upsertEwuraReportPending({
    stationId: args.stationId,
    reportDate: reportDate || null,
    sourceQueueId: args.sourceQueueId ?? null,
    payload: {
      ewuraType: 'inventory',
      endpoint: EWURA_ENDPOINTS.inventory,
      request: summary,
      xml,
      originalPayload: args.payload ?? null,
    },
  })

  try {
    const result = await postEwuraXml({
      baseUrl: cfg.ewura.baseUrl,
      endpoint: EWURA_ENDPOINTS.inventory,
      xml,
    })

    if (result.ok) {
      await markEwuraReportSent({
        stationId: args.stationId,
        id: row!.id,
        reference: result.reference,
        response: result.responsePayload,
      })
      return {
        ok: true as const,
        reportType: 'EWURA_DAILY_INVENTORY',
        reportDateTime: new Date().toISOString(),
        payload: { request: summary, response: result.responsePayload },
        reference: result.reference ?? null,
      }
    }

    await markEwuraReportFailed({
      stationId: args.stationId,
      id: row!.id,
      error: result.error || 'EWURA report failed',
      response: result.responsePayload,
    })
    return {
      ok: false as const,
      error: result.error || 'EWURA report failed',
      retryable: true,
    }
  } catch (e: any) {
    const error = String(e?.message || e)
    await markEwuraReportFailed({
      stationId: args.stationId,
      id: row!.id,
      error,
    })
    return { ok: false as const, error, retryable: true }
  }
}
