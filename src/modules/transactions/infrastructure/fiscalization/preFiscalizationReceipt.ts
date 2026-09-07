import type { FiscalReceiptModel, PrintableLine } from '@/src/shared/fiscalization/receipt/types'

import { queryOne } from '@/src/platform/db/postgres'
import { buildReceiptLines as buildTanzaniaReceiptLines } from '@/src/shared/fiscalization/receipt/templates/TZ'
import { buildTanzaniaReceiptVerificationUrl } from '@/src/modules/tanzania-fiscal/domain/receiptVerificationPrefix'
import { ensureTanzaniaPreFiscalizationReceiptAssignment } from '@/src/modules/tanzania-fiscal/infrastructure/preFiscalizationReceiptAssignment'
import { generateReceipt } from '@/src/modules/transactions/infrastructure/fiscalization/receiptGenerator'
import { buildFiscalReceipt } from '@/src/modules/transactions/infrastructure/fiscalization/receiptBuilder'
import { uuidv4 } from '@/src/shared/utils/uuid'

const WIDTH = 42

const renderReceiptText = (lines: PrintableLine[], width = WIDTH) => {
  const output: string[] = []
  const separator = '-'.repeat(width)
  for (const line of lines) {
    if (line.type === 'separator') {
      output.push(separator)
    } else if (line.type === 'empty') {
      for (let index = 0; index < Math.max(1, line.lines ?? 1); index += 1) {
        output.push('')
      }
    } else if (line.type === 'qr') {
      output.push('[QR]', line.value)
    } else if (line.type === 'image') {
      output.push(`[IMAGE:${line.asset.toUpperCase().replace(/-/g, '_')}]`)
    } else if (line.align === 'center') {
      const pad = Math.max(0, Math.floor((width - line.value.length) / 2))
      output.push(`${' '.repeat(pad)}${line.value}`)
    } else if (line.align === 'right') {
      output.push(`${' '.repeat(Math.max(0, width - line.value.length))}${line.value}`)
    } else {
      output.push(line.value)
    }
  }
  return output.join('\n')
}

const toDateParts = (value: string | Date) => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return { date: '', time: '' }
  return {
    date: date.toISOString().slice(0, 10),
    time: date.toISOString().slice(11, 19),
  }
}

async function buildTanzaniaPreFiscalizationReceipt(input: {
  stationId: string
  transactionId: string
}) {
  const assignment = await ensureTanzaniaPreFiscalizationReceiptAssignment(input)
  if (!assignment) return null

  const settings = await queryOne<{
    tanzania_receipt_verification_prefix_mode: any
  }>(
    `SELECT tanzania_receipt_verification_prefix_mode
       FROM station_settings
      WHERE station_id = $1::uuid`,
    [input.stationId],
  )
  const base = await buildFiscalReceipt(input)
  const invoiceDate = toDateParts(assignment.invoice_date)
  const verificationUrl = buildTanzaniaReceiptVerificationUrl({
    receiptVerificationNumber: assignment.receipt_verification_number,
    mode: settings?.tanzania_receipt_verification_prefix_mode,
    invoiceDate: assignment.invoice_date,
    receiptTime: invoiceDate.time,
  })
  if (!verificationUrl) {
    throw new Error(
      `Unable to build Tanzania receipt verification URL for transaction ${input.transactionId}`,
    )
  }
  const model: FiscalReceiptModel = {
    ...base.model,
    transaction: {
      ...base.model.transaction,
      receiptDate: invoiceDate.date || base.model.transaction.receiptDate,
      receiptTime: invoiceDate.time || base.model.transaction.receiptTime,
    },
    fiscalMeta: {
      ...base.model.fiscalMeta,
      receiptNumber: String(assignment.global_counter),
      traReceiptNumber: String(assignment.global_counter),
      dailyCount: String(assignment.daily_counter),
      globalCount: String(assignment.global_counter),
      zNumber: assignment.z_number,
      verificationCode: assignment.receipt_verification_number,
      verificationUrl,
    },
    qrPayload: {
      data: verificationUrl,
      verificationUrl,
    },
  }
  const lines = buildTanzaniaReceiptLines(model)
  return {
    ...base,
    model,
    lines,
    text: renderReceiptText(lines),
    receiptNumber: String(assignment.global_counter),
  }
}

export async function getOrCreatePreFiscalizationReceipt(input: {
  stationId: string
  transactionId: string
}) {
  const station = await queryOne<{ country: string | null }>(
    `SELECT country FROM fuel_stations WHERE id = $1::uuid`,
    [input.stationId],
  )
  const isTanzania = ['TZ', 'TZA', 'TANZANIA', 'UNITED REPUBLIC OF TANZANIA'].includes(
    String(station?.country ?? '').trim().toUpperCase(),
  )

  let expectedVerificationCode = ''
  let preparedTanzaniaReceipt: Awaited<ReturnType<typeof buildTanzaniaPreFiscalizationReceipt>> = null
  if (isTanzania) {
    preparedTanzaniaReceipt = await buildTanzaniaPreFiscalizationReceipt(input)
    expectedVerificationCode = String(
      preparedTanzaniaReceipt?.model?.fiscalMeta?.verificationCode ?? '',
    ).trim()
  }

  const existing = await queryOne<any>(
    `SELECT *
       FROM receipts
      WHERE station_id = $1::uuid
        AND transaction_id = $2::uuid
      ORDER BY generated_at DESC
      LIMIT 1`,
    [input.stationId, input.transactionId],
  )
  if (existing) {
    if (!isTanzania) return existing
    const fiscalData =
      typeof existing.fiscal_data === 'string'
        ? (() => {
            try {
              return JSON.parse(existing.fiscal_data)
            } catch {
              return null
            }
          })()
        : existing.fiscal_data
    const storedCode = String(
      fiscalData?.receipt?.fiscalVerificationCode ??
        fiscalData?.model?.fiscalMeta?.verificationCode ??
        '',
    ).trim()
    if (expectedVerificationCode && storedCode === expectedVerificationCode) {
      return existing
    }
  }

  const generated = isTanzania && preparedTanzaniaReceipt
    ? await generateReceipt(input, {
        buildReceipt: async () => preparedTanzaniaReceipt!,
      })
    : await generateReceipt(input)

  return await queryOne<any>(
    `INSERT INTO receipts (
       id, transaction_id, station_id, receipt_number,
       html_content, plain_text_content, fiscal_data, branding_snapshot,
       render_version
     ) VALUES ($1,$2::uuid,$3::uuid,$4,NULL,$5,$6::jsonb,$7::jsonb,$8)
     RETURNING *`,
    [
      uuidv4(),
      input.transactionId,
      input.stationId,
      generated.receiptNumber,
      generated.plainTextContent,
      JSON.stringify(generated.fiscalData),
      generated.brandingSnapshot
        ? JSON.stringify(generated.brandingSnapshot)
        : null,
      generated.renderVersion,
    ],
  )
}
