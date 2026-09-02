import type { FiscalReceiptModel, PrintableLine } from '../types'
import { formatColumns } from '../formatColumns'

const line = (
  value: string,
  align: 'left' | 'center' | 'right' = 'left',
  bold?: boolean,
): PrintableLine => ({ type: 'text', value, align, bold })

const separator = (): PrintableLine => ({ type: 'separator' })
const empty = (lines = 1): PrintableLine => ({ type: 'empty', lines })

const clean = (value: unknown) => String(value ?? '').trim()

const money = (value: number, precision = 0) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(Number.isFinite(value) ? value : 0)

const quantity = (value: number) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)

const leftRight = (label: string, value: unknown) =>
  line(
    formatColumns({
      widths: [22, 20],
      values: [label, clean(value)],
      aligns: ['left', 'right'],
    }),
  )

const addCenteredLines = (lines: PrintableLine[], values?: string[]) => {
  for (const value of values ?? []) {
    const text = clean(value)
    if (text) lines.push(line(text, 'center'))
  }
}

export const buildReceiptLines = (
  model: FiscalReceiptModel,
): PrintableLine[] => {
  const lines: PrintableLine[] = []
  const totalTax = model.taxSummary.reduce(
    (sum, entry) => sum + Number(entry.taxAmount || 0),
    0,
  )
  const totalExcludingTax = model.taxSummary.length
    ? model.taxSummary.reduce(
        (sum, entry) => sum + Number(entry.taxableAmount || 0),
        0,
      )
    : model.payment.amount - totalTax
  const zNumber = model.fiscalMeta.zNumber || ''

  lines.push({ type: 'image', asset: 'tra-receipt-start' })
  if (model.customization?.logoPath) {
    lines.push({ type: 'image', asset: 'branding-logo' })
  }

  addCenteredLines(lines, model.customization?.headerLines)
  if (model.customization?.headerLines?.length) lines.push(separator())

  lines.push(line(model.station.name || 'Station', 'center', true))
  if (model.station.mobile)
    lines.push(line(`MOBILE: ${model.station.mobile}`, 'center'))
  if (model.station.taxId)
    lines.push(line(`TIN: ${model.station.taxId}`, 'center'))
  if (model.station.vrn) lines.push(line(`VRN: ${model.station.vrn}`, 'center'))
  if (model.station.serial)
    lines.push(line(`SERIAL NO: ${model.station.serial}`, 'center'))
  if (model.station.uin) lines.push(line(`UIN: ${model.station.uin}`, 'center'))
  if (model.station.taxOffice)
    lines.push(line(`TAX OFFICE: ${model.station.taxOffice}`, 'center'))
  lines.push(separator())

  const hasCustomer =
    clean(model.customer.name) &&
    clean(model.customer.name).toLowerCase() !== 'walk-in customer'
  const hasCustomerId =
    Boolean(clean(model.customer.tin)) && clean(model.customer.tin) !== 'N/A'
  const hasCustomerSection =
    hasCustomer || Boolean(model.customer.phone) || hasCustomerId
  if (hasCustomerSection) {
    lines.push(leftRight('CUSTOMER ID TYPE:', hasCustomerId ? '1' : '6'))
  }
  if (hasCustomerId) lines.push(leftRight('CUSTOMER ID:', model.customer.tin))
  if (hasCustomer) lines.push(leftRight('CUSTOMER NAME:', model.customer.name))
  if (model.customer.phone)
    lines.push(leftRight('CUSTOMER MOBILE:', model.customer.phone))
  if (hasCustomerSection) {
    lines.push(separator())
  }

  lines.push(
    leftRight(
      'RECEIPT NUMBER:',
      model.fiscalMeta.traReceiptNumber || model.fiscalMeta.receiptNumber,
    ),
  )
  if (zNumber) lines.push(leftRight('Z NUMBER:', zNumber))
  lines.push(
    leftRight(
      'RECEIPT DATE:',
      model.transaction.receiptDate || model.transaction.date,
    ),
  )
  if (model.transaction.receiptTime) {
    lines.push(leftRight('RECEIPT TIME:', model.transaction.receiptTime))
  }
  lines.push(separator())

  if (model.transaction.pumpNumber || model.transaction.nozzleNumber) {
    lines.push(
      line(
        `PUMP: ${model.transaction.pumpNumber || '-'} | NOZZLE: ${model.transaction.nozzleNumber || '-'}`,
      ),
    )
    lines.push(separator())
  }

  model.items.forEach((item) => {
    lines.push(
      line(
        formatColumns({
          widths: [10, 16, 16],
          values: [
            item.name.toUpperCase(),
            `${quantity(item.quantity)} x ${money(item.unitPrice)}`,
            money(item.amount),
          ],
          aligns: ['left', 'left', 'right'],
        }),
      ),
    )
  })

  lines.push(separator())
  lines.push(leftRight('TOTAL EXCL TAX:', money(totalExcludingTax)))
  lines.push(leftRight('DISCOUNT:', money(model.payment.discount || 0)))
  lines.push(separator())
  lines.push(leftRight('TOTAL TAX:', money(totalTax)))
  lines.push(separator())
  lines.push(leftRight('TOTAL INCL TAX:', money(model.payment.amount)))
  lines.push(separator())
  lines.push(leftRight('PAYMENT METHOD:', model.payment.method))
  lines.push(separator())

  if (model.fiscalMeta.verificationCode) {
    lines.push(line('RECEIPT VERIFICATION CODE', 'center'))
    lines.push(line(model.fiscalMeta.verificationCode, 'center', true))
  }
  if (model.qrPayload?.data) {
    lines.push(empty())
    lines.push({ type: 'qr', value: model.qrPayload.data })
  }
  if (model.fiscalMeta.verificationUrl) {
    lines.push(line(model.fiscalMeta.verificationUrl, 'center'))
  }
  lines.push(separator())

  addCenteredLines(lines, model.customization?.footerLines)
  lines.push({ type: 'image', asset: 'tra-receipt-end' })

  return lines
}
