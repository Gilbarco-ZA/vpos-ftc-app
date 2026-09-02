import { queryAll } from '@/src/platform/db/postgres'

export type LegacyImportLedgerQuery = {
  stationId: string
  status?: string | null
  limit: number
  offset: number
}

export async function listLegacyImportLedger(input: LegacyImportLedgerQuery) {
  const params: unknown[] = [input.stationId]
  let where = 'WHERE station_id = $1'
  if (input.status) {
    params.push(input.status)
    where += ` AND status = $${params.length}`
  }
  params.push(input.limit, input.offset)

  return queryAll<Record<string, unknown>>(
    `
      SELECT
        id, status, source_type, source_path, relative_path, file_name, file_size,
        sha256, error_message, moved_to_path, updated_at
      FROM legacy_import_ledger
      ${where}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  )
}
