import { queryOne } from '@/src/platform/db/postgres'

import { readCertSerial, readTanzaniaFiscalConfig } from './config'
import { getTraBearerToken } from './traAuth'
import {
  buildTraReceiptFromTransaction,
  readExistingCreditNoteCounters,
} from './traReceipt'
import { parseXmlTag } from './xml'

function redactedHeaders(headers: Record<string, string>) {
  return {
    ...headers,
    Authorization: headers.Authorization ? 'bearer ***' : undefined,
  }
}

async function buildTraPostHeaders(args: { stationId: string }) {
  const cfg = await readTanzaniaFiscalConfig(args.stationId)
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
    'Routing-key': cfg.tra.routingKey,
  }
  if (certSerial) headers['Cert-Serial'] = certSerial
  if (token) headers.Authorization = `bearer ${token}`

  return headers
}

function parseTraAck(rawResponse: string) {
  const ackcode =
    parseXmlTag(rawResponse, 'ACKCODE') ??
    parseXmlTag(rawResponse, 'ackcode') ??
    parseXmlTag(rawResponse, 'ackCode')
  const ackmsg =
    parseXmlTag(rawResponse, 'ACKMSG') ??
    parseXmlTag(rawResponse, 'ackmsg') ??
    parseXmlTag(rawResponse, 'ackMessage')
  return { ackcode, ackmsg }
}

function isSuccessfulTraResponse(response: Response, ackcode: string | null) {
  return response.ok && (ackcode == null || ackcode === '0')
}

function traError(args: {
  ok: boolean
  httpStatus: number
  ackcode: string | null
  ackmsg: string | null
  context: string
}) {
  if (args.ok) return null
  if (args.ackcode && args.ackcode !== '0') {
    return `TRA returned ackcode ${args.ackcode}${args.ackmsg ? `: ${args.ackmsg}` : ''}`
  }
  return `TRA ${args.context} request failed (${args.httpStatus})`
}

export async function sendTraReceiptFromDb(args: {
  stationId: string
  transaction: any
  customer: any | null
}) {
  const payload = await buildTraReceiptFromTransaction(args)
  const headers = await buildTraPostHeaders({ stationId: args.stationId })

  const response = await fetch(payload.endpoint, {
    method: 'POST',
    headers,
    body: payload.xml,
  })
  const rawResponse = await response.text().catch(() => '')
  const { ackcode, ackmsg } = parseTraAck(rawResponse)
  const ok = isSuccessfulTraResponse(response, ackcode)

  return {
    ok,
    httpStatus: response.status,
    rawResponse,
    reference: payload.receiptVerificationNo,
    verificationUrl: payload.verificationUrl,
    request: {
      tra: {
        receiptNo: payload.receiptNo,
        dailyCount: payload.dailyCount,
        globalCount: payload.globalCount,
        znum: payload.znum,
        receiptVerificationNo: payload.receiptVerificationNo,
        verificationCode: payload.verificationCode,
        verificationUrl: payload.verificationUrl,
      },
      endpoint: payload.endpoint,
      headers: redactedHeaders(headers),
      xml: payload.xml,
      unsignedXml: payload.unsignedXml,
      items: payload.items,
      totals: payload.totals,
      payments: payload.payments,
      vatTotals: payload.vatTotals,
    },
    response: {
      ackcode,
      ackmsg,
      raw: rawResponse,
      httpStatus: response.status,
    },
    error: traError({
      ok,
      httpStatus: response.status,
      ackcode,
      ackmsg,
      context: 'receipt',
    }),
  }
}

async function persistCreditNoteTraRequest(args: {
  stationId: string
  creditNoteId: string
  request: unknown
}) {
  await queryOne(
    `UPDATE credit_notes
        SET proxy_response = jsonb_set(
              jsonb_set(
                COALESCE(proxy_response, '{}'::jsonb),
                '{localTanzania}',
                COALESCE(proxy_response->'localTanzania', '{}'::jsonb),
                true
              ),
              '{localTanzania,tra,request}',
              $3::jsonb,
              true
            ),
            updated_at = NOW()
      WHERE station_id = $1 AND id = $2`,
    [args.stationId, args.creditNoteId, JSON.stringify(args.request ?? null)],
  )
}

export async function sendTraCreditNoteFromDb(args: {
  stationId: string
  transaction: any
  customer: any | null
  creditNote: any
}) {
  const reasonCode = String(args.creditNote?.reason_code ?? '').trim()
  const descriptionPrefix = reasonCode
    ? `CREDIT NOTE ${reasonCode} - `
    : 'CREDIT NOTE - '

  const payload = await buildTraReceiptFromTransaction({
    stationId: args.stationId,
    transaction: args.transaction,
    customer: args.customer,
    receiptDate: args.creditNote?.created_at ?? new Date(),
    reuseTransactionCounters: false,
    existingCounters: readExistingCreditNoteCounters(args.creditNote),
    amountMultiplier: -1,
    descriptionPrefix,
  })
  const headers = await buildTraPostHeaders({ stationId: args.stationId })
  const request = {
    tra: {
      receiptNo: payload.receiptNo,
      dailyCount: payload.dailyCount,
      globalCount: payload.globalCount,
      znum: payload.znum,
      receiptVerificationNo: payload.receiptVerificationNo,
      verificationCode: payload.verificationCode,
      verificationUrl: payload.verificationUrl,
      creditNoteId: args.creditNote?.id ?? null,
      originalTransactionId: args.transaction?.id ?? null,
      originalFiscalReference:
        args.transaction?.fiscalization_reference ??
        args.transaction?.fiscal_document_id ??
        args.transaction?.pos_reference ??
        null,
    },
    endpoint: payload.endpoint,
    headers: redactedHeaders(headers),
    xml: payload.xml,
    unsignedXml: payload.unsignedXml,
    items: payload.items,
    totals: payload.totals,
    payments: payload.payments,
    vatTotals: payload.vatTotals,
  }

  await persistCreditNoteTraRequest({
    stationId: args.stationId,
    creditNoteId: String(args.creditNote.id),
    request,
  })

  const response = await fetch(payload.endpoint, {
    method: 'POST',
    headers,
    body: payload.xml,
  })
  const rawResponse = await response.text().catch(() => '')
  const { ackcode, ackmsg } = parseTraAck(rawResponse)
  const ok = isSuccessfulTraResponse(response, ackcode)

  return {
    ok,
    httpStatus: response.status,
    rawResponse,
    reference: payload.receiptVerificationNo,
    verificationUrl: payload.verificationUrl,
    request,
    response: {
      ackcode,
      ackmsg,
      raw: rawResponse,
      httpStatus: response.status,
    },
    error: traError({
      ok,
      httpStatus: response.status,
      ackcode,
      ackmsg,
      context: 'credit note',
    }),
  }
}
