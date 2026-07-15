import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import { query, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type LedgerStatus = 'imported' | 'skipped' | 'failed'

export type LedgerEntry = {
  id: string
  station_id: string
  sha256: string
  file_size: number
  status: LedgerStatus
  import_run_id: string | null
  moved_to_path: string | null
  error_message: string | null
}

export async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(/*turbopackIgnore: true*/ filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export async function getFileMeta(filePath: string) {
  const st = await fs.stat(/*turbopackIgnore: true*/ filePath)
  // compat: older importer variants used bytes + mtimeMs
  return {
    size: st.size,
    bytes: st.size,
    mtime: st.mtime,
    mtimeMs: st.mtime.getTime(),
  }
}
export async function ledgerFind(
  stationId: string,
  sha256: string,
  fileSize: number,
): Promise<LedgerEntry | null>
export async function ledgerFind(params: {
  stationId: string
  sha256: string
  bytes?: number
  relative_path?: string
  // ignored but accepted for compatibility with older importer call-sites
  sourceType?: string
  kind?: string
  [k: string]: any
}): Promise<LedgerEntry | null>
export async function ledgerFind(
  a: any,
  b?: any,
  c?: any,
): Promise<LedgerEntry | null> {
  let stationId: string
  let sha256: string
  let fileSize: number

  if (typeof a === 'object' && a) {
    stationId = a.stationId
    sha256 = a.sha256
    fileSize = a.bytes ?? a.fileSize ?? 0
  } else {
    stationId = a
    sha256 = b
    fileSize = c
  }

  return await queryOne<LedgerEntry>(
    `SELECT id, station_id, sha256, file_size, status, import_run_id, moved_to_path, error_message
     FROM legacy_import_ledger
     WHERE station_id = $1 AND sha256 = $2 AND file_size = $3
     LIMIT 1`,
    [stationId, sha256, fileSize],
  )
}

export async function ledgerUpsert(params: {
  stationId: string
  sha256: string
  status: LedgerStatus
  // canonical fields (preferred)
  sourceType?: string
  sourcePath?: string
  relativePath?: string | null
  fileName?: string
  fileSize?: number
  fileMtime?: Date | null
  errorMessage?: string | null
  movedToPath?: string | null

  // compat aliases used by older importer variants
  bytes?: number
  mtime_ms?: number
  relative_path?: string | null
  runId?: string
  kind?: string
  [k: string]: any
}) {
  const sourceType = params.sourceType ?? 'unknown'
  const sourcePath = params.sourcePath ?? ''
  const relativePath = params.relativePath ?? params.relative_path ?? null
  const fileSize = params.fileSize ?? params.bytes ?? 0
  const fileName =
    params.fileName ??
    (relativePath
      ? path.basename(relativePath)
      : path.basename(sourcePath || 'unknown.json'))
  const fileMtime =
    params.fileMtime ??
    (typeof params.mtime_ms === 'number' ? new Date(params.mtime_ms) : null)

  const importRunId = (params.importRunId ?? params.runId ?? null) as
    | string
    | null

  await query(
    `INSERT INTO legacy_import_ledger (
      id, station_id, source_type, source_path, relative_path,
      file_name, file_size, file_mtime, sha256,
      status, error_message, moved_to_path, import_run_id, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP)
    ON CONFLICT (station_id, sha256, file_size)
    DO UPDATE SET
      status = EXCLUDED.status,
      error_message = EXCLUDED.error_message,
      moved_to_path = EXCLUDED.moved_to_path,
      import_run_id = EXCLUDED.import_run_id,
      source_path = EXCLUDED.source_path,
      relative_path = EXCLUDED.relative_path,
      updated_at = CURRENT_TIMESTAMP`,
    [
      uuidv4(),
      params.stationId,
      sourceType,
      sourcePath,
      relativePath,
      fileName,
      fileSize,
      fileMtime,
      params.sha256,
      params.status,
      params.errorMessage ?? null,
      params.movedToPath ?? null,
      importRunId,
    ],
  )
}

export function relativeToPermDir(permDir: string, filePath: string) {
  try {
    const rel = path.relative(permDir, filePath)
    return rel.startsWith('..') ? null : rel
  } catch {
    return null
  }
}
