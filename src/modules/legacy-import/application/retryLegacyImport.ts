import { importLegacyIfPresent } from '@/src/platform/bootstrap/legacy-importer'
import { queryOne } from '@/src/platform/db/postgres'

import { recomputeDailyTotalsRange } from '@/src/modules/transactions/application/recomputeDailyTotalsRange'

export async function retryLegacyImport(args: {
  stationId: string
  ledgerId: string
}) {
  const ledger = await queryOne<{ source_path: string }>(
    `SELECT source_path FROM legacy_import_ledger WHERE id = $1 AND station_id = $2`,
    [args.ledgerId, args.stationId],
  )

  if (!ledger?.source_path) {
    return { found: false as const }
  }

  const result = await importLegacyIfPresent({
    stationId: args.stationId,
    legacyPermDir:
      process.env.LEGACY_PERM_DIR || '/opt/fccapps/vpos-perm/vposfiscal',
    moveAsideRoot: process.env.LEGACY_IMPORT_DIR,
  })

  if (result) {
    const to = new Date().toISOString().slice(0, 10)
    const fromDate = new Date()
    fromDate.setUTCDate(fromDate.getUTCDate() - 90)
    const from = fromDate.toISOString().slice(0, 10)
    await recomputeDailyTotalsRange(args.stationId, from, to)
  }

  return {
    found: true as const,
    imported: !!result,
  }
}
