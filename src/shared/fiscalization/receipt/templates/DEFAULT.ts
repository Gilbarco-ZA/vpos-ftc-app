import type { FiscalReceiptModel, PrintableLine } from '../types'
import { formatColumns } from '../formatColumns'

const WIDTH = 42

const line = (
  value: string,
  align: 'left' | 'center' | 'right' = 'left',
  bold?: boolean,
): PrintableLine => ({
  type: 'text',
  value,
  align,
  bold,
})

const empty = (lines = 1): PrintableLine => ({ type: 'empty', lines })

const separator = (): PrintableLine => ({ type: 'separator' })

const wrapText = (value: string, width: number) => {
  const words = value.split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (!current.length) {
      current = word
      continue
    }
    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current.length) lines.push(current)
  return lines.flatMap((item) => {
    if (item.length <= width) return [item]
    const chunks: string[] = []
    for (let i = 0; i < item.length; i += width) {
      chunks.push(item.slice(i, i + width))
    }
    return chunks
  })
}

const formatMoney = (value: number, decimals = 2) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)

const formatCount = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)

const formatVolume = (value: number, decimals = 2) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)

export const buildReceiptLines = (
  model: FiscalReceiptModel,
): PrintableLine[] => {
  const lines: PrintableLine[] = []
  const stationName = model.station.name || 'Station'
  const taxId = model.station.taxId || ''
  const country = String(model.station.country || '')
    .trim()
    .toUpperCase()
  const taxIdLabel =
    country === 'KE'
      ? 'PIN'
      : ['TZ', 'TZN'].includes(country)
        ? 'TIN'
        : 'Tax ID'
  const fallbackVatRate = ['TZ', 'TZN'].includes(country) ? 18 : 16

  lines.push(line('*** NORMAL SALES RECEIPT ***', 'center', true))
  lines.push(line(stationName, 'center'))
  if (taxId) lines.push(line(`${taxIdLabel}: ${taxId}`, 'center'))
  lines.push(empty())

  const headerRow = formatColumns({
    widths: [22, 20],
    values: [
      `Date: ${model.transaction.date}`,
      `Invoice No: ${model.transaction.invoiceNo}`,
    ],
    aligns: ['left', 'right'],
  })
  lines.push(line(headerRow))
  lines.push(line(`Tax Invoice: ${model.transaction.fiscalReference}`))
  if (String(model.transaction.status || '').toUpperCase() === 'CREDITED') {
    lines.push(line('*** CREDITED TRANSACTION ***', 'center', true))
  }
  lines.push(line(`Customer Name: ${model.customer.name}`))
  if (model.customer.vehicleRegNr) {
    lines.push(line(`Vehicle Reg No: ${model.customer.vehicleRegNr}`))
  }
  if (model.customer.odometer) {
    lines.push(line(`Odometer: ${model.customer.odometer}`))
  }
  if (model.customer.paymentType) {
    lines.push(line(`Payment Type: ${model.customer.paymentType}`))
  }
  lines.push(line(`Attendant: ${model.transaction.attendant || '—'}`))
  lines.push(separator())

  lines.push(
    line(
      formatColumns({
        widths: [18, 4, 4, 8, 8],
        values: ['ITEM', 'TAX', 'QTY', 'PRICE', 'AMOUNT'],
        aligns: ['left', 'left', 'right', 'right', 'right'],
      }),
    ),
  )

  model.items.forEach((item) => {
    const itemLines = wrapText(item.name, 18)
    itemLines.forEach((itemLine) => lines.push(line(itemLine)))
    lines.push(
      line(
        formatColumns({
          widths: [18, 4, 4, 8, 8],
          values: [
            '',
            item.taxCode,
            formatVolume(item.quantity, model.decimals.volume),
            formatMoney(item.unitPrice, model.decimals.unitPrice),
            formatMoney(item.amount, model.decimals.money),
          ],
          aligns: ['left', 'left', 'right', 'right', 'right'],
        }),
      ),
    )
  })

  lines.push(separator())
  lines.push(
    line(
      formatColumns({
        widths: [18, 12, 12],
        values: ['Tax Type', 'Taxable', 'Tax'],
        aligns: ['left', 'right', 'right'],
      }),
    ),
  )

  const defaultTaxRows = [
    { taxCode: 'A', label: 'Exempt', rate: 0 },
    { taxCode: 'B', label: 'VAT', rate: fallbackVatRate },
    { taxCode: 'C', label: 'Zero Rated', rate: 0 },
    { taxCode: 'D', label: 'Non VAT', rate: 0 },
  ]
  const summaryByCode = new Map(
    model.taxSummary.map((summary) => [summary.taxCode.toUpperCase(), summary]),
  )
  const extraSummaries = model.taxSummary.filter(
    (summary) =>
      !defaultTaxRows.some((entry) => entry.taxCode === summary.taxCode),
  )

  defaultTaxRows.forEach((entry) => {
    const summary = summaryByCode.get(entry.taxCode)
    const label = `${entry.taxCode} - ${summary?.label || entry.label} ${Number(summary?.rate ?? entry.rate)}%`
    lines.push(
      line(
        formatColumns({
          widths: [18, 12, 12],
          values: [
            label,
            formatMoney(
              Number(summary?.taxableAmount ?? 0),
              model.decimals.money,
            ),
            formatMoney(Number(summary?.taxAmount ?? 0), model.decimals.money),
          ],
          aligns: ['left', 'right', 'right'],
        }),
      ),
    )
  })

  extraSummaries.forEach((summary) => {
    const label = `${summary.taxCode} - ${summary.label} ${summary.rate}%`
    lines.push(
      line(
        formatColumns({
          widths: [18, 12, 12],
          values: [
            label,
            formatMoney(summary.taxableAmount, model.decimals.money),
            formatMoney(summary.taxAmount, model.decimals.money),
          ],
          aligns: ['left', 'right', 'right'],
        }),
      ),
    )
  })

  lines.push(separator())

  const currency = model.payment.currency || 'Ksh'
  lines.push(
    line(
      formatColumns({
        widths: [28, 14],
        values: [
          model.payment.method,
          `${currency} ${formatMoney(model.payment.amount, model.decimals.money)}`,
        ],
        aligns: ['left', 'right'],
      }),
    ),
  )
  lines.push(
    line(
      formatColumns({
        widths: [28, 14],
        values: ['ITEMS NUMBER', formatCount(model.payment.itemsCount)],
        aligns: ['left', 'right'],
      }),
    ),
  )

  lines.push(separator())
  lines.push(line('SCU INFORMATION'))
  if (model.fiscalMeta.scuId)
    lines.push(line(`SCU ID: ${model.fiscalMeta.scuId}`))
  if (model.fiscalMeta.cuInvoiceNo)
    lines.push(line(`CU Invoice No: ${model.fiscalMeta.cuInvoiceNo}`))
  lines.push(line(`Receipt Number: ${model.fiscalMeta.receiptNumber}`))

  if (model.fiscalMeta.internalData) {
    lines.push(empty())
    lines.push(line('Internal Data:'))
    wrapText(model.fiscalMeta.internalData, WIDTH).forEach((row) =>
      lines.push(line(row)),
    )
  }

  if (model.fiscalMeta.signature) {
    lines.push(empty())
    lines.push(line('Receipt Signature:'))
    wrapText(model.fiscalMeta.signature, WIDTH).forEach((row) =>
      lines.push(line(row)),
    )
  }

  if (model.qrPayload?.data) {
    lines.push(empty())
    lines.push(line('QR:'))
    lines.push({ type: 'qr', value: model.qrPayload.data })
    if (model.qrPayload.verificationUrl) {
      wrapText(model.qrPayload.verificationUrl, WIDTH).forEach((row) =>
        lines.push(line(row)),
      )
    }
  }

  lines.push(separator())
  lines.push(line('This is a COPY 1', 'center'))

  return lines
}
