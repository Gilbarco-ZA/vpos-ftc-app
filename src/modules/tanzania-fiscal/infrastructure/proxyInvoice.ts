import type { TanzaniaReceiptVerificationPrefixMode } from '@/src/modules/tanzania-fiscal/domain/receiptVerificationPrefix'
import type { PoolClient } from '@/src/platform/db/postgres'
import type {
  ProxyInvoiceRequest,
  TanzaniaProxyInvoiceMetadata,
} from '@/src/shared/fiscalization/proxy/contracts'

import { queryOne, txQuery, withTransaction } from '@/src/platform/db/postgres'

import { resolveTanzaniaCustomerIdentity } from '@/src/modules/tanzania-fiscal/domain/customerIdentity'
import { resolveTanzaniaReceiptVerificationPrefix } from '@/src/modules/tanzania-fiscal/domain/receiptVerificationPrefix'

import { readTanzaniaFiscalConfig } from './config'
import { assertTanzaniaProxyTaxCodes } from './proxyInvoiceTaxPolicy'
import {
  applyTanzaniaTankProjectionToInvoice,
  ensureTanzaniaTransactionTankProjection,
} from './transactionTankProjection'
import { normalizeTraPaymentType } from './traReceipt'
import { dateParts, isoDateTimeInTimezone } from './xml'

type AssignmentRow = {
  invoice_number: string
  receipt_verification_number: string
  z_number: string
  daily_counter: string | number
  global_counter: string | number
  invoice_date: string | Date
}

type ReceiptPrefixRow = {
  receipt_verification_prefix_mode: TanzaniaReceiptVerificationPrefixMode | null
  receipt_verification_prefix_override: string | null
}

function asMetadata(
  row: AssignmentRow,
  args: {
    customer: any | null
    createdByName: string | null
    paymentType: unknown
    amount: number
    timezone: string
  },
): TanzaniaProxyInvoiceMetadata {
  const customer = args.customer ?? null
  const customerName = String(
    customer?.buyer_name ?? customer?.business_name ?? customer?.name ?? '',
  ).trim()
  const customerIdentity = resolveTanzaniaCustomerIdentity({
    tin: customer?.tin,
  })
  const customerMobile = String(
    customer?.contact_mobile ?? customer?.contact_phone ?? '',
  ).trim()

  return {
    invoiceNumber: row.invoice_number,
    rctVerificationNum: row.receipt_verification_number,
    zNumber: row.z_number,
    dailyCounter: Number(row.daily_counter),
    globalCounter: Number(row.global_counter),
    invoiceDate: isoDateTimeInTimezone(row.invoice_date, args.timezone),
    custIdType: customerIdentity.customerIdType,
    custId: customerIdentity.customerId,
    custName: customerName || 'Walk In',
    custMobile: customerMobile,
    issuedBy: args.createdByName || 'VPOS-LITE',
    isPosted: true,
    exchangeRate: 1,
    payments: [
      {
        paymentMode: normalizeTraPaymentType(args.paymentType),
        amount: Number(args.amount.toFixed(2)),
      },
    ],
  }
}

async function loadAssignment(
  stationId: string,
  transactionId: string,
  client?: PoolClient,
) {
  const sql = `SELECT invoice_number,
                      receipt_verification_number,
                      z_number,
                      daily_counter,
                      global_counter,
                      invoice_date
                 FROM tanzania_proxy_invoice_assignments
                WHERE station_id = $1::uuid
                  AND transaction_id = $2::uuid
                LIMIT 1`
  if (client) {
    const result = await txQuery<AssignmentRow>(client, sql, [
      stationId,
      transactionId,
    ])
    return result.rows?.[0] ?? null
  }
  return await queryOne<AssignmentRow>(sql, [stationId, transactionId])
}

async function allocateAssignment(args: {
  stationId: string
  transactionId: string
  transactionDate: string
  fiscalizationDate: string
  timezone: string
}) {
  return await withTransaction(async (client) => {
    await txQuery(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `tanzania-proxy-invoice:${args.stationId}:${args.transactionId}`,
    ])

    const existing = await loadAssignment(
      args.stationId,
      args.transactionId,
      client,
    )
    if (existing) return existing

    const prefixResult = await txQuery<ReceiptPrefixRow>(
      client,
      `SELECT tanzania_receipt_verification_prefix_mode AS receipt_verification_prefix_mode,
              tanzania_receipt_verification_prefix_override AS receipt_verification_prefix_override
         FROM station_settings
        WHERE station_id = $1::uuid
        LIMIT 1
        FOR SHARE`,
      [args.stationId],
    )
    const prefixRow = prefixResult.rows?.[0]
    const receiptVerificationPrefix = resolveTanzaniaReceiptVerificationPrefix({
      mode: prefixRow?.receipt_verification_prefix_mode,
      override: prefixRow?.receipt_verification_prefix_override,
    })

    const transactionDate = dateParts(args.transactionDate, args.timezone)
    const fiscalDate = dateParts(args.fiscalizationDate, args.timezone)
    const global = await txQuery<{ counter_value: string | number }>(
      client,
      `INSERT INTO tanzania_fiscal_counters (station_id, counter_key, counter_value)
       VALUES ($1::uuid, 'receipt:global', 1)
       ON CONFLICT (station_id, counter_key)
       DO UPDATE SET counter_value = tanzania_fiscal_counters.counter_value + 1,
                     updated_at = NOW()
       RETURNING counter_value`,
      [args.stationId],
    )
    const daily = await txQuery<{ counter_value: string | number }>(
      client,
      `INSERT INTO tanzania_fiscal_counters (station_id, counter_key, counter_value)
       VALUES ($1::uuid, $2, 1)
       ON CONFLICT (station_id, counter_key)
       DO UPDATE SET counter_value = tanzania_fiscal_counters.counter_value + 1,
                     updated_at = NOW()
       RETURNING counter_value`,
      [args.stationId, `receipt:${transactionDate.compactDate}`],
    )

    const globalCounter = Number(global.rows?.[0]?.counter_value ?? 1)
    const dailyCounter = Number(daily.rows?.[0]?.counter_value ?? 1)
    const invoiceNumber = `INV-${transactionDate.isoDate.replace(/-/g, '/')}-${String(
      dailyCounter,
    ).padStart(2, '0')}`
    const receiptVerificationNumber = `${receiptVerificationPrefix}${globalCounter}`

    const inserted = await txQuery<AssignmentRow>(
      client,
      `INSERT INTO tanzania_proxy_invoice_assignments (
         station_id, transaction_id, invoice_number,
         receipt_verification_number, z_number,
         daily_counter, global_counter, invoice_date
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::timestamptz)
       RETURNING invoice_number,
                 receipt_verification_number,
                 z_number,
                 daily_counter,
                 global_counter,
                 invoice_date`,
      [
        args.stationId,
        args.transactionId,
        invoiceNumber,
        receiptVerificationNumber,
        fiscalDate.compactDate,
        dailyCounter,
        globalCounter,
        args.fiscalizationDate,
      ],
    )

    return inserted.rows[0]
  })
}

export async function enrichTanzaniaProxyInvoice(args: {
  stationId: string
  transaction: any
  customer: any | null
  createdByName: string | null
  invoice: ProxyInvoiceRequest
}): Promise<ProxyInvoiceRequest> {
  // Validate before allocating receipt counters so a proxy-rejected tax code
  // cannot create gaps in the Tanzania fiscal sequence.
  assertTanzaniaProxyTaxCodes(args.invoice)

  const config = await readTanzaniaFiscalConfig(args.stationId)
  const transactionId = String(args.transaction?.id ?? '').trim()
  if (!transactionId) {
    throw new Error('Tanzania invoice requires a transaction id')
  }

  // Resolve and persist the Tanzania regulatory tank projection before
  // allocating fiscal counters. Configuration/ATG failures therefore do not
  // consume an invoice number, and retries retain the original ATG baseline.
  const hasFuelLine = (args.invoice.lines ?? []).some((line) =>
    Boolean(line.product?.fuel),
  )
  const tankProjection = hasFuelLine
    ? await ensureTanzaniaTransactionTankProjection({
        stationId: args.stationId,
        transactionId,
      })
    : null
  if (hasFuelLine && !tankProjection) {
    throw new Error(
      'Tanzania fuel invoice requires a persisted transaction tank projection.',
    )
  }
  const invoice = tankProjection
    ? applyTanzaniaTankProjectionToInvoice(args.invoice, tankProjection)
    : args.invoice

  const transactionDate = new Date(
    args.transaction?.transaction_date_time ?? invoice.issueDateTime,
  ).toISOString()
  const fiscalizationDate = new Date().toISOString()
  const assignment = await allocateAssignment({
    stationId: args.stationId,
    transactionId,
    transactionDate,
    fiscalizationDate,
    timezone: config.station.timezone || 'Africa/Dar_es_Salaam',
  })
  const amount = Number(
    invoice.totals?.amount ?? args.transaction?.total_amount ?? 0,
  )
  const tanzania = asMetadata(assignment, {
    customer: args.customer,
    createdByName: args.createdByName,
    paymentType: args.transaction?.payment_type,
    amount: Number.isFinite(amount) ? amount : 0,
    timezone: config.station.timezone || 'Africa/Dar_es_Salaam',
  })

  return {
    ...invoice,
    documentNumber: tanzania.invoiceNumber,
    currency: 'TZS',
    countryCode: 'TZ',
    tanzania,
  }
}
