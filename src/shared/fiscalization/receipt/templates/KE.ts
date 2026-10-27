import type { FiscalReceiptModel, PrintableLine } from '../types'
import { buildReceiptLines as buildDefaultLines } from './DEFAULT'

const text = (value: string, align: 'left' | 'center' = 'left', bold = false): PrintableLine =>
  ({ type: 'text', value, align, bold })

/**
 * KRA-style thermal layout. All receipt fields come from fiscal evidence;
 * missing SCU fields are omitted, never invented.
 */
export const buildReceiptLines = (model: FiscalReceiptModel): PrintableLine[] => {
  const base = buildDefaultLines({
    ...model,
    qrPayload: model.qrPayload?.verificationUrl &&
      /^https:\/\/[^\s]+$/i.test(model.qrPayload.verificationUrl)
      ? { data: model.qrPayload.verificationUrl, verificationUrl: model.qrPayload.verificationUrl }
      : null,
  })
  const lines: PrintableLine[] = [
    text('TAX INVOICE', 'center', true),
    text(model.station.name || 'TRADE NAME', 'center', true),
    ...(model.station.taxId ? [text('PIN: ' + model.station.taxId, 'center')] : []),
    text('------------------------------', 'center'),
  ]
  for (const entry of base) {
    if (entry.type === 'text' && (
      entry.value.includes('*** NORMAL SALES RECEIPT ***') ||
      entry.value === (model.station.name || 'Station') ||
      (model.station.taxId && entry.value === 'PIN: ' + model.station.taxId)
    )) continue
    if (entry.type === 'text' && entry.value === 'SCU INFORMATION') {
      lines.push(text('SCU INFORMATION', 'center', true))
      continue
    }
    lines.push(entry)
  }
  return lines
}
