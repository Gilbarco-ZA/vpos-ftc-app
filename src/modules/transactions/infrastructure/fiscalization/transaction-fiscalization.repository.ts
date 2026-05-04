import type { FiscalRunResult } from '@/src/modules/transactions/infrastructure/fiscalization/fiscal-run-result'

import { queryOne, txQuery, withTransaction } from '@/src/platform/db/postgres'
import { getEnvValue } from '@/src/shared/config/envDb'
import { enqueuePrintJob } from '@/src/shared/print/queue'
import { generateReceipt } from '@/src/shared/receipts/generate'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { mapTransactionToProxyInvoice } from '@/src/modules/transactions/infrastructure/fiscalization/transaction-proxy.mapper'
import { toSampleInvoicePayload } from '@/src/modules/transactions/infrastructure/fiscalization/transaction-proxy.payload'
import { getTransactionDetailsRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction-read.repository'
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
  return await enqueuePrintJob(
    stationId,
    'TRANSACTION_RECEIPT',
    { transactionId },
    0,
    {
      idempotencyKey: `txn-receipt:${transactionId}`,
      sourceTransactionId: transactionId,
    },
  )
}

export async function getTransactionReceiptRepo(
  stationId: string,
  transactionId: string,
) {
  return await generateReceipt({ stationId, transactionId })
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
    await transactionStatusService.markFiscalized({
      stationId,
      transactionId,
      fiscalizationReference: fiscalResult.reference ?? null,
      fiscalizationResponse: fiscalResult.rawResponse,
      client,
    })

    await txQuery(
      client,
      `
        INSERT INTO fiscalization_events (
          id, station_id, transaction_id, engine, status, reference,
          request_payload, response_payload, error_message
        )
        VALUES ($1,$2,$3,$4,'SUCCESS',$5,$6,$7,NULL)
      `,
      [
        uuidv4(),
        stationId,
        transactionId,
        fiscalResult.engine,
        fiscalResult.reference ?? null,
        fiscalResult.requestPayload
          ? JSON.stringify(fiscalResult.requestPayload)
          : null,
        fiscalResult.responsePayload
          ? JSON.stringify(fiscalResult.responsePayload)
          : null,
      ],
    )

    const existingReceipt = await txQuery<any>(
      client,
      `SELECT id FROM receipts WHERE transaction_id = $1 AND station_id = $2 LIMIT 1`,
      [transactionId, stationId],
    )

    const stationSettings = await txQuery<any>(
      client,
      `SELECT auto_print_receipts FROM station_settings WHERE station_id = $1`,
      [stationId],
    )
    const autoPrintReceipts =
      stationSettings.rows?.[0]?.auto_print_receipts === true

    if (!existingReceipt.rows?.[0] || autoPrintReceipts) {
      const receiptPayload = await generateReceipt({ stationId, transactionId })

      if (!existingReceipt.rows?.[0]) {
        await txQuery(
          client,
          `
            INSERT INTO receipts (
              id, transaction_id, station_id, receipt_number,
              html_content, plain_text_content, fiscal_data, branding_snapshot
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            uuidv4(),
            transactionId,
            stationId,
            receiptPayload.receiptNumber,
            receiptPayload.htmlContent,
            receiptPayload.plainTextContent || null,
            JSON.stringify(receiptPayload.fiscalData),
            receiptPayload.brandingSnapshot
              ? JSON.stringify(receiptPayload.brandingSnapshot)
              : null,
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
            JSON.stringify({
              type: 'receiptData',
              data: receiptPayload,
              state: { transactionId },
            }),
            `receipt:${transactionId}:default`,
            transactionId,
          ],
        )
      }
    }

    return { success: true, transactionId }
  })
}

export async function failTransactionFiscalizationRepo(input: {
  stationId: string
  transactionId: string
  fiscalResult: FiscalRunResult & { status: 'FAILED' }
}) {
  const { stationId, transactionId, fiscalResult } = input
  return await withTransaction(async (client) => {
    await transactionStatusService.markFailed({
      stationId,
      transactionId,
      lastError: fiscalResult.errorMessage || 'Fiscalization failed',
      incrementRetryCount: true,
      fiscalizationResponse: fiscalResult.rawResponse,
      client,
    })

    await txQuery(
      client,
      `
        INSERT INTO fiscalization_events (
          id, station_id, transaction_id, engine, status, reference,
          request_payload, response_payload, error_message
        )
        VALUES ($1,$2,$3,$4,'FAILED',NULL,$5,$6,$7)
      `,
      [
        uuidv4(),
        stationId,
        transactionId,
        fiscalResult.engine,
        fiscalResult.requestPayload
          ? JSON.stringify(fiscalResult.requestPayload)
          : null,
        fiscalResult.responsePayload
          ? JSON.stringify(fiscalResult.responsePayload)
          : null,
        fiscalResult.errorMessage || 'Fiscalization failed',
      ],
    )

    return { success: false, transactionId }
  })
}
