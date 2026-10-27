import type { FiscalReceiptModel, PrintableLine } from '../types'

const WIDTH = 42
const text = (value: string, align: 'left' | 'center' | 'right' = 'left', bold = false): PrintableLine =>
  ({ type: 'text', value, align, bold })
const sep = (): PrintableLine => ({ type: 'separator' })
const empty = (): PrintableLine => ({ type: 'empty', lines: 1 })
const money = (amount: number, digits = 2) => Number(amount || 0).toFixed(digits)
const wrap = (value: string): string[] => {
  const chunks = value.match(/.{1,42}/g)
  return chunks?.length ? chunks : []
}
const pair = (label: string, value: string) =>
  text(label + ' '.repeat(Math.max(1, WIDTH - label.length - value.length)) + value)

/**
 * Kenya eTIMS thermal receipt, based on KRA's tax-invoice section ordering.
 * Optional SCU/TIS values are printed only when genuine source data exists.
 */
export const buildReceiptLines = (model: FiscalReceiptModel): PrintableLine[] => {
  const lines: PrintableLine[] = [
    text('TAX INVOICE', 'center', true),
    text(model.station.name || 'TRADE NAME', 'center', true),
  ]
  if (model.station.taxId) lines.push(text('PIN: ' + model.station.taxId, 'center'))
  lines.push(sep(), text('Normal Invoice', 'center'), empty())
  if (model.customer.name) lines.push(text('Buyer: ' + model.customer.name))
  if (model.customer.tin) lines.push(text('Buyer PIN: ' + model.customer.tin))
  lines.push(sep())
  for (const item of model.items) {
    lines.push(text(item.name))
    lines.push(pair(
      money(item.quantity, model.decimals.volume) + ' x ' + money(item.unitPrice, model.decimals.unitPrice),
      money(item.amount, model.decimals.money) + ' ' + item.taxCode,
    ))
  }
  lines.push(sep())
  const tax = model.taxSummary.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0)
  const discount = Number(model.payment.discount || 0)
  const total = Number(model.payment.amount || 0)
  lines.push(pair('TOTAL BEFORE DISCOUNT', money(total + discount, model.decimals.money)))
  if (discount) lines.push(pair('TOTAL DISCOUNT AWARDED', money(discount, model.decimals.money)))
  lines.push(pair('SUB TOTAL', money(total - tax, model.decimals.money)))
  lines.push(pair('VAT', money(tax, model.decimals.money)))
  lines.push(pair('TOTAL', money(total, model.decimals.money)))
  lines.push(sep())
  lines.push(pair(model.payment.method.toUpperCase(), money(total, model.decimals.money)))
  lines.push(pair('ITEMS NUMBER', String(model.payment.itemsCount)))
  lines.push(sep(), text('Rate        Taxable Amount        VAT'))
  for (const item of model.taxSummary) {
    lines.push(pair(
      item.label + ' ' + String(item.rate) + '%',
      money(item.taxableAmount, model.decimals.money) + '  ' + money(item.taxAmount, model.decimals.money),
    ))
  }
  lines.push(sep(), text('SCU INFORMATION', 'center', true))
  if (model.transaction.date) lines.push(text('Date: ' + model.transaction.date))
  if (model.fiscalMeta.scuId) lines.push(text('SCU ID: ' + model.fiscalMeta.scuId))
  if (model.fiscalMeta.cuInvoiceNo) lines.push(text('CU INVOICE NO: ' + model.fiscalMeta.cuInvoiceNo))
  if (model.fiscalMeta.receiptNumber) lines.push(text('Receipt Number: ' + model.fiscalMeta.receiptNumber))
  if (model.fiscalMeta.internalData) {
    lines.push(text('Internal Data:'))
    for (const row of wrap(model.fiscalMeta.internalData)) lines.push(text(row))
  }
  if (model.fiscalMeta.signature) {
    lines.push(text('Receipt Signature:'))
    for (const row of wrap(model.fiscalMeta.signature)) lines.push(text(row))
  }
  const url = model.qrPayload?.verificationUrl
  if (url && /^https:\/\/[^\s]+$/i.test(url)) {
    lines.push(empty(), text('KRA Verification QR', 'center'))
    lines.push({ type: 'qr', value: url })
  }
  lines.push(sep())
  if (model.fiscalMeta.traReceiptNumber) {
    lines.push(text('TIS INFORMATION', 'center', true))
    lines.push(text('RECEIPT NUMBER: ' + model.fiscalMeta.traReceiptNumber))
    if (model.transaction.receiptDate) lines.push(text('DATE: ' + model.transaction.receiptDate))
    if (model.transaction.receiptTime) lines.push(text('TIME: ' + model.transaction.receiptTime))
    lines.push(sep())
  }
  lines.push(text('THANK YOU', 'center', true))
  return lines
}
