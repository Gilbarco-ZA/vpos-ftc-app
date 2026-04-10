import { queryOne as pgOne } from '@/src/platform/db/postgres'
import { buildFiscalReceipt } from '@/src/shared/fiscalization/receiptBuilder'
import { renderEscpos } from '@/src/shared/printers/escposRenderer'

export const generateReceipt = async (params: {
  stationId: string
  transactionId: string
}): Promise<{
  receiptNumber: string
  htmlContent: string
  plainTextContent?: string
  fiscalData: any
  brandingSnapshot?: any
  escposBase64?: string
  receiptLines?: any
}> => {
  const branding = await pgOne<any>(
    `SELECT * FROM branding_settings WHERE station_id = $1`,
    [params.stationId],
  )

  const receipt = await buildFiscalReceipt({
    stationId: params.stationId,
    transactionId: params.transactionId,
  })

  const fiscalData = {
    model: receipt.model,
    templateModel: receipt.templateModel,
    transactionId: params.transactionId,
    stationId: params.stationId,
  }

  const escposBuffer = renderEscpos(receipt.lines, { width: 42 })
  const escposBase64 = escposBuffer.toString('base64')

  return {
    receiptNumber: receipt.receiptNumber,
    htmlContent: receipt.html,
    plainTextContent: receipt.text,
    fiscalData,
    receiptLines: receipt.lines,
    escposBase64,
    brandingSnapshot: branding
      ? {
          primaryColor: branding.primary_color,
          secondaryColor: branding.secondary_color,
          stationDisplayName: branding.station_display_name,
          receiptHeaderText: branding.receipt_header_text,
          receiptFooterText: branding.receipt_footer_text,
          logoPath: branding.logo_path,
        }
      : undefined,
  }
}
