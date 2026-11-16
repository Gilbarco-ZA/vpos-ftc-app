import type { FiscalRunResult } from '@/src/modules/transactions/infrastructure/fiscalization/fiscal-run-result'

import { queryOne, txQuery, withTransaction } from '@/src/platform/db/postgres'
import { getEnvValue } from '@/src/shared/config/envDb'
import { resolveReceiptContent } from '@/src/shared/receipts/receiptContent'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { enqueuePrintJob } from '@/src/modules/printing/application/enqueuePrintJob'
import { buildReferencePrintJobPayload } from '@/src/modules/printing/domain/printJobPayload'
import { persistFiscalizationEventRepo } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'
import { generateReceipt } from '@/src/modules/transactions/infrastructure/fiscalization/receiptGenerator'
import { mapTransactionToProxyInvoice } from '@/src/modules/transactions/infrastructure/fiscalization/transaction-proxy.mapper'
import { toSampleInvoicePayload } from '@/src/modules/transactions/infrastructure/fiscalization/transaction-proxy.payload'
import {
  getOrCreateLatestTransactionReceiptRepo,
  getTransactionDetailsRepo,
} from '@/src/modules/transactions/infrastructure/persistence/transaction-read.repository'
import { transactionStatusService } from '@/src/modules/transactions/infrastructure/persistence/transaction-status.repository'
import { mapTransactionInvoiceLines } from '@/src/modules/transactions/infrastructure/persistence/transaction.mapper'
import {
  getDefaultTaxTypeSql,
  getStationCountrySql,
} from '@/src/modules/transactions/infrastructure/persistence/transaction.sql'

export async function enqueueTransactionReceiptPrintRepo(
  stationId: string,
  transactionId: string,
) {
  const receipt = await getOrCreateLatestTransactionReceiptRepo(
    stationId,
    transactionId,
  )
  return await enqueuePrintJob(
    stationId,
    'print.receipt',
    {
      receiptId: receipt?.id ?? undefined,
      receiptNumber: receipt?.receipt_number ?? undefined,
      source: 'vpos.transaction-receipt',
    },
    0,
    {
      idempotencyKey: `txn-receipt:${transactionId}`,
      sourceTransactionId: transactionId,
      payloadMode: 'reference',
    },
  )
}

export async function getTransactionReceiptRepo(
  stationId: string,
  transactionId: string,
) {
  const receipt = await getOrCreateLatestTransactionReceiptRepo(
    stationId,
    transactionId,
  )
  if (!receipt) return null

  const content = resolveReceiptContent({
    plainTextContent: receipt.plain_text_content,
    htmlContent: receipt.html_content,
    renderVersion: receipt.render_version,
  })

  return {
    id: receipt.id,
    transactionId: receipt.transaction_id,
    stationId: receipt.station_id,
    receiptNumber: receipt.receipt_number,
    htmlContent: content.htmlContent,
    plainTextContent: content.plainTextContent,
    renderVersion: content.renderVersion,
    fiscalData: receipt.fiscal_data,
    brandingSnapshot: receipt.branding_snapshot,
    generatedAt: receipt.generated_at,
    voidedAt: receipt.voided_at ?? null,
  }
}

export async function getTransactionInvoicePayloadRepo(
  stationId: string,
  transactionId: string,
) {
  const txn = await getTransactionDetailsRepo(stationId, transactionId)
  if (!txn) return null

  const [station, defaultTaxType] = await Promise.all([
    queryOne<{ id: string; country: string | null }>(getStationCountrySql, [
      stationId,
    ]),
    queryOne<{ code: string; rate: number | string | null }>(
      getDefaultTaxTypeSql,
      [stationId],
    ),
  ])

  const vatRate = await (async () => {
    const country = String(station?.country ?? '')
      .trim()
      .toUpperCase()
    if (country === 'TZ') {
      return Number(
        (await getEnvValue(stationId, 'VPOS_VAT_RATE_TZ', '0.18')) || 0,
      )
    }
    if (country === 'KE') {
      return Number(
        (await getEnvValue(stationId, 'VPOS_VAT_RATE_KE', '16')) || 0,
      )
    }
    return Number(
      (await getEnvValue(stationId, 'VPOS_VAT_RATE_DEFAULT', '0')) || 0,
    )
  })()

  const invoice = mapTransactionToProxyInvoice({
    transaction: {
      ...txn,
      lines: mapTransactionInvoiceLines(txn.lines),
    },
    customer:
      txn.buyer_name || txn.tin
        ? {
            name: txn.buyer_name ?? null,
            buyerType: txn.buyer_type ?? null,
            pin: txn.tin ?? null,
          }
        : null,
    station,
    vatRate,
    taxType: defaultTaxType?.code ?? null,
    taxRate: defaultTaxType?.rate == null ? null : Number(defaultTaxType.rate),
    createdByName: 'VPOS-LITE',
  })

  return {
    transactionId,
    invoice,
    sample: toSampleInvoicePayload(invoice),
  }
}

export async function completeTransactionFiscalizationRepo(input: {
  stationId: string
  transactionId: string
  fiscalResult: FiscalRunResult & { status: 'SUCCESS' }
}) {
  const { stationId, transactionId, fiscalResult } = input
  return await withTransaction(async (client) => {
    const recorded = await persistFiscalizationEventRepo({
      stationId,
      transactionId,
      engine: fiscalResult.engine,
      transport: 'internal',
      status: 'SUCCESS',
      reference: fiscalResult.reference ?? null,
      requestPayload: fiscalResult.requestPayload,
      responsePayload:
        fiscalResult.responsePayload ?? fiscalResult.rawResponse ?? null,
      client,
    })

    await transactionStatusService.markFiscalized({
      stationId,
      transactionId,
      fiscalizationReference: fiscalResult.reference ?? null,
      fiscalizationResponse: recorded.compatibilitySummary,
      latestFiscalEventId: recorded.event.id,
      client,
    })

    const existingReceipt = await txQuery<any>(
      client,
      `SELECT id, receipt_number
         FROM receipts
        WHERE transaction_id = $1 AND station_id = $2
        ORDER BY generated_at DESC
        LIMIT 1`,
      [transactionId, stationId],
    )

    const stationSettings = await txQuery<any>(
      client,
      `SELECT auto_print_receipts FROM station_settings WHERE station_id = $1`,
      [stationId],
    )
    const autoPrintReceipts =
      stationSettings.rows?.[0]?.auto_print_receipts === true

    let receiptId = String(existingReceipt.rows?.[0]?.id ?? '')
    let receiptNumber = String(existingReceipt.rows?.[0]?.receipt_number ?? '')

    if (!receiptId) {
      const receiptPayload = await generateReceipt({
        stationId,
        transactionId,
      })
      receiptId = uuidv4()
      receiptNumber = receiptPayload.receiptNumber

      await txQuery(
        client,
        `
          INSERT INTO receipts (
            id, transaction_id, station_id, receipt_number,
            html_content, plain_text_content, fiscal_data, branding_snapshot,
            render_version
          )
          VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8)
        `,
        [
          receiptId,
          transactionId,
          stationId,
          receiptNumber,
          receiptPayload.plainTextContent,
          JSON.stringify(receiptPayload.fiscalData),
          receiptPayload.brandingSnapshot
            ? JSON.stringify(receiptPayload.brandingSnapshot)
            : null,
          receiptPayload.renderVersion,
        ],
      )
    }

    if (autoPrintReceipts) {
      await txQuery(
        client,
        `
          INSERT INTO print_jobs (
            id, station_id, job_type, payload, priority,
            idempotency_key, source_transaction_id
          )
          VALUES ($1, $2, 'print.receipt', $3::jsonb, 10, $4, $5)
          ON CONFLICT (station_id, idempotency_key) DO UPDATE
          SET updated_at = CURRENT_TIMESTAMP
        `,
        [
          uuidv4(),
          stationId,
          JSON.stringify(
            buildReferencePrintJobPayload({
              type: 'receipt',
              source: 'vpos.auto-print-receipt',
              receiptId,
              receiptNumber,
            }),
          ),
          `receipt:${transactionId}:default`,
          transactionId,
        ],
      )
    }

    return {
      success: true,
      transactionId,
      fiscalEventId: recorded.event.id,
      fiscalizationSummary: recorded.compatibilitySummary,
    }
  })
}

export async function failTransactionFiscalizationRepo(input: {
  stationId: string
  transactionId: string
  fiscalResult: FiscalRunResult & { status: 'FAILED' }
}) {
  const { stationId, transactionId, fiscalResult } = input
  return await withTransaction(async (client) => {
    const recorded = await persistFiscalizationEventRepo({
      stationId,
      transactionId,
      engine: fiscalResult.engine,
      transport: 'internal',
      status: 'FAILED',
      requestPayload: fiscalResult.requestPayload,
      responsePayload:
        fiscalResult.responsePayload ?? fiscalResult.rawResponse ?? null,
      errorMessage: fiscalResult.errorMessage || 'Fiscalization failed',
      client,
    })

    await transactionStatusService.markFailed({
      stationId,
      transactionId,
      lastError: fiscalResult.errorMessage || 'Fiscalization failed',
      incrementRetryCount: true,
      fiscalizationResponse: recorded.compatibilitySummary,
      latestFiscalEventId: recorded.event.id,
      client,
    })

    return {
      success: false,
      transactionId,
      fiscalEventId: recorded.event.id,
      fiscalizationSummary: recorded.compatibilitySummary,
    }
  })
}
