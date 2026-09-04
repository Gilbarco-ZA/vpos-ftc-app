import type { EscposLine } from '@/src/shared/printers/types'

const TANZANIA_IMAGE_MARKERS = {
  '[IMAGE:TRA_RECEIPT_START]': 'tra-receipt-start',
  '[IMAGE:BRANDING_LOGO]': 'branding-logo',
  '[IMAGE:TRA_RECEIPT_END]': 'tra-receipt-end',
} as const

const RIGHT_ALIGNED_TANZANIA_LABELS = new Set([
  'CUSTOMER ID TYPE:',
  'CUSTOMER ID:',
  'CUSTOMER NAME:',
  'CUSTOMER MOBILE:',
  'RECEIPT NUMBER:',
  'Z NUMBER:',
  'RECEIPT DATE:',
  'RECEIPT TIME:',
])

const textValue = (value: unknown) => String(value ?? '').trim()

export function extractReceiptQrData(fiscalData: unknown): string | null {
  let parsed = fiscalData
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  const root = parsed as Record<string, any>
  const receipt = root.receipt ?? root.model?.receipt ?? root
  return (
    textValue(
      receipt?.fiscalQrCodeData ??
        receipt?.fiscal_qr_code_data ??
        root?.qrPayload?.data ??
        root?.model?.qrPayload?.data,
    ) || null
  )
}

export function extractReceiptPrintMetadata(fiscalData: unknown): {
  country: string | null
  siteName: string | null
  siteTin: string | null
} {
  let parsed = fiscalData
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      parsed = null
    }
  }
  const root =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : null
  const receipt = root?.receipt ?? root?.model?.receipt ?? null
  const station = root?.model?.station ?? null
  return {
    country:
      textValue(receipt?.country ?? station?.country ?? root?.country) || null,
    siteName:
      textValue(receipt?.companyName ?? station?.name ?? root?.companyName) ||
      null,
    siteTin:
      textValue(receipt?.companyTin ?? station?.taxId ?? root?.companyTin) ||
      null,
  }
}

const rightAlignedPair = (row: string, width: number) => {
  const match = row.trim().match(/^([^:]+:)[ \t]*(.*)$/)
  if (!match || !RIGHT_ALIGNED_TANZANIA_LABELS.has(match[1])) return null
  const label = match[1]
  const value = match[2].trim()
  return `${label}${' '.repeat(Math.max(1, width - label.length - value.length))}${value}`
}

export function buildReceiptEscposLines(input: {
  plainText: string
  qrData?: string | null
  country?: string | null
  width?: number
  siteNames?: Array<string | null | undefined>
  siteTin?: string | null
  includeBrandLogo?: boolean
  offlinePrint?: boolean
}): EscposLine[] {
  const source = String(input.plainText ?? '').replace(/\r\n/g, '\n')
  const rows = source.split('\n')
  const lines: EscposLine[] = []
  const qrOverride = textValue(input.qrData)
  const width = Math.max(20, Math.floor(input.width ?? 42))
  const isTanzania = ['TZ', 'TZA', 'TANZANIA'].includes(
    textValue(input.country).toUpperCase(),
  )
  const offlinePrint = isTanzania && input.offlinePrint === true
  const siteNames = new Set(
    (input.siteNames ?? [])
      .map((value) => textValue(value).toLowerCase())
      .filter(Boolean),
  )

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? ''
    const imageAsset =
      TANZANIA_IMAGE_MARKERS[row.trim() as keyof typeof TANZANIA_IMAGE_MARKERS]
    if (imageAsset) {
      lines.push({ type: 'image', asset: imageAsset })
      continue
    }
    if (row.trim() === '[QR]') {
      const serializedQrRow = textValue(rows[index + 1])
      const qrData = qrOverride || serializedQrRow
      if (serializedQrRow) index += 1
      if (!offlinePrint && qrData) lines.push({ type: 'qr', value: qrData })
      continue
    }
    if (!row) {
      lines.push({ type: 'empty' })
      continue
    }
    if (/^-{3,}$/.test(row)) {
      lines.push({ type: 'separator' })
      continue
    }
    const cleanRow = row.trim()
    if (siteNames.has(cleanRow.toLowerCase())) {
      lines.push({ type: 'text', value: cleanRow, align: 'center', bold: true })
      continue
    }
    if (isTanzania && /^TIN:/i.test(cleanRow)) {
      lines.push({ type: 'text', value: cleanRow, align: 'center' })
      continue
    }
    const alignedPair = isTanzania ? rightAlignedPair(row, width) : null
    if (alignedPair) {
      lines.push({ type: 'text', value: alignedPair })
      continue
    }
    lines.push({ type: 'text', value: row })
  }

  if (isTanzania) {
    const hasStart = lines.some(
      (line) => line.type === 'image' && line.asset === 'tra-receipt-start',
    )
    const hasLogo = lines.some(
      (line) => line.type === 'image' && line.asset === 'branding-logo',
    )
    if (!hasStart) lines.unshift({ type: 'image', asset: 'tra-receipt-start' })
    if (input.includeBrandLogo && !hasLogo) {
      const startIndex = lines.findIndex(
        (line) => line.type === 'image' && line.asset === 'tra-receipt-start',
      )
      lines.splice(startIndex + 1, 0, { type: 'image', asset: 'branding-logo' })
    }

    const siteTin = textValue(input.siteTin)
    const hasTin = lines.some(
      (line) => line.type === 'text' && /^TIN:/i.test(line.value.trim()),
    )
    if (siteTin && !hasTin) {
      const siteIndex = lines.findIndex(
        (line) =>
          line.type === 'text' &&
          siteNames.has(line.value.trim().toLowerCase()),
      )
      const insertAt = siteIndex >= 0 ? siteIndex + 1 : 1
      lines.splice(insertAt, 0, {
        type: 'text',
        value: `TIN: ${siteTin}`,
        align: 'center',
      })
    }

    let endIndex = lines.findIndex(
      (line) => line.type === 'image' && line.asset === 'tra-receipt-end',
    )
    if (offlinePrint) {
      const hasOfflineMarker = lines.some(
        (line) =>
          line.type === 'text' && line.value.trim().toUpperCase() === 'OFFLINE PRINT',
      )
      if (!hasOfflineMarker) {
        const marker: EscposLine = {
          type: 'text',
          value: 'OFFLINE PRINT',
          align: 'center',
          bold: true,
        }
        if (endIndex >= 0) {
          lines.splice(endIndex, 0, marker)
          endIndex += 1
        } else {
          lines.push(marker)
        }
      }
    }
    if (endIndex < 0) lines.push({ type: 'image', asset: 'tra-receipt-end' })
  }

  return lines
}
