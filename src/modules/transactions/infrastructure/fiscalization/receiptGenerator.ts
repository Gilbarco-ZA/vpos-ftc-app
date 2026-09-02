import type {
  ReceiptBrandingSnapshotV1,
  ReceiptFiscalSnapshotV1,
} from '@/src/shared/receipts/receiptSnapshots'

import { queryOne as pgOne } from '@/src/platform/db/postgres'
import { normalizeBrandLogoPath } from '@/src/shared/branding/settings'
import { renderEscpos } from '@/src/shared/printers/escposRenderer'
import { RECEIPT_RENDER_VERSION } from '@/src/shared/receipts/receiptContent'
import {
  buildReceiptBrandingSnapshot,
  buildReceiptFiscalSnapshot,
} from '@/src/shared/receipts/receiptSnapshots'

import { buildFiscalReceipt } from '@/src/modules/transactions/infrastructure/fiscalization/receiptBuilder'

export type ReceiptGeneratorDeps = {
  loadBranding: (stationId: string) => Promise<any>
  buildReceipt: typeof buildFiscalReceipt
  renderReceipt: typeof renderEscpos
}

const DEFAULT_RECEIPT_GENERATOR_DEPS: ReceiptGeneratorDeps = {
  loadBranding: async (stationId) =>
    await pgOne<any>(`SELECT * FROM branding_settings WHERE station_id = $1`, [
      stationId,
    ]),
  buildReceipt: buildFiscalReceipt,
  renderReceipt: renderEscpos,
}

export type GeneratedReceipt = {
  receiptNumber: string
  plainTextContent: string
  renderVersion: number
  fiscalData: ReceiptFiscalSnapshotV1
  brandingSnapshot?: ReceiptBrandingSnapshotV1
  escposBase64: string
  receiptLines: unknown[]
}

export const generateReceipt = async (
  params: {
    stationId: string
    transactionId: string
  },
  dependencyOverrides?: Partial<ReceiptGeneratorDeps>,
): Promise<GeneratedReceipt> => {
  const deps = {
    ...DEFAULT_RECEIPT_GENERATOR_DEPS,
    ...dependencyOverrides,
  }
  const branding = await deps.loadBranding(params.stationId)

  const receipt = await deps.buildReceipt({
    stationId: params.stationId,
    transactionId: params.transactionId,
  })

  const escposBuffer = deps.renderReceipt(receipt.lines, { width: 42 })

  return {
    receiptNumber: receipt.receiptNumber,
    plainTextContent: receipt.text,
    renderVersion: RECEIPT_RENDER_VERSION,
    fiscalData: buildReceiptFiscalSnapshot({
      model: receipt.model,
    }),
    receiptLines: receipt.lines,
    escposBase64: escposBuffer.toString('base64'),
    brandingSnapshot: branding
      ? buildReceiptBrandingSnapshot({
          primaryColor: branding.primary_color,
          secondaryColor: branding.secondary_color,
          stationDisplayName: branding.station_display_name,
          receiptHeaderText: branding.receipt_header_text,
          receiptFooterText: branding.receipt_footer_text,
          logoPath: normalizeBrandLogoPath(branding.logo_path),
        })
      : undefined,
  }
}
