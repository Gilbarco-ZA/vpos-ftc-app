import fs from 'fs/promises'
import path from 'path'
import type { ImportContext } from '@/src/modules/setup/infrastructure/legacy-importer/types'

import { queryOne } from '@/src/platform/db/postgres'

import {
  getFileMeta,
  ledgerFind,
  ledgerUpsert,
  relativeToPermDir,
  sha256File,
} from '@/src/modules/setup/infrastructure/legacy-importer/ledger'
import { moveAside } from '@/src/modules/setup/infrastructure/legacy-importer/moveAside'

export async function fileHasContent(filePath: string): Promise<boolean> {
  try {
    const st = await fs.stat(/*turbopackIgnore: true*/ filePath)
    return st.isFile() && st.size > 5
  } catch {
    return false
  }
}

export async function folderHasJsonFiles(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(/*turbopackIgnore: true*/ dir, {
      withFileTypes: true,
    })
    return entries.some(
      (e) => e.isFile() && e.name.toLowerCase().endsWith('.json'),
    )
  } catch {
    return false
  }
}

export async function safeReadJson(filePath: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(/*turbopackIgnore: true*/ filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(/*turbopackIgnore: true*/ p)
    return true
  } catch {
    return false
  }
}

export function toNumber(v: any, fallback: number | null = 0): number | null {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}

export async function existsByLegacyFilename(
  table: string,
  stationId: string,
  legacyFilename: string,
) {
  const row = await queryOne<any>(
    `SELECT id FROM ${table} WHERE station_id = $1 AND legacy_filename = $2 LIMIT 1`,
    [stationId, legacyFilename],
  )
  return !!row
}

export async function ewuraExistsByLegacyFilename(
  table: 'ewura_transactions' | 'ewura_reports',
  stationId: string,
  legacyFilename: string,
) {
  const row = await queryOne<any>(
    `
    SELECT id
    FROM ${table}
    WHERE station_id = $1
      AND payload_json->>'_legacyFilename' = $2
    LIMIT 1
    `,
    [stationId, legacyFilename],
  )
  return !!row
}

export async function markSkippedAndMove(params: {
  ctx: ImportContext
  stationId: string
  sourcePath: string
  relativePath: string
  fileName: string
  fileSize: number
  fileMtime: Date
  sha256: string
}) {
  const moved = await moveAside({
    moveRoot: params.ctx.moveAsideRoot,
    runId: params.ctx.runId,
    status: 'imported',
    relativePath: params.relativePath,
    from: params.sourcePath,
  })

  await ledgerUpsert({
    stationId: params.stationId,
    sourceType: params.ctx.sourceType,
    sourcePath: params.sourcePath,
    relativePath: params.relativePath,
    fileName: params.fileName,
    fileSize: params.fileSize,
    fileMtime: params.fileMtime,
    sha256: params.sha256,
    status: 'skipped',
    movedToPath: moved.movedTo,
  })

  return moved
}

export async function importSingleJsonFile(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  fileName: string
  kind: string
  onInserted: () => void
  onMoved: () => void
  onWarn: (w: string) => void
  handler: (json: any) => Promise<void>
}) {
  const { ctx, stationId, legacyPermDir } = opts
  const fp = path.join(/*turbopackIgnore: true*/ legacyPermDir, opts.fileName)
  if (!(await fileHasContent(fp))) return

  try {
    const meta = await getFileMeta(fp)
    const sha = await sha256File(fp)
    const rel = relativeToPermDir(legacyPermDir, fp)

    const existing = await ledgerFind({
      stationId,
      sourceType: ctx.sourceType,
      kind: opts.kind,
      relative_path: rel || undefined,
      sha256: sha,
    })
    if (existing) return

    const raw = await fs.readFile(/*turbopackIgnore: true*/ fp, 'utf8')
    const json = JSON.parse(raw)
    await opts.handler(json)

    const moved = await moveAside({
      moveRoot: ctx.moveAsideRoot,
      runId: ctx.runId,
      status: 'imported',
      relativePath: rel || '',
      from: fp,
    })

    await ledgerUpsert({
      stationId,
      sourceType: ctx.sourceType,
      kind: opts.kind,
      relative_path: rel,
      sha256: sha,
      bytes: meta.bytes,
      mtime_ms: meta.mtimeMs,
      movedToPath: moved.movedTo,
      importRunId: ctx.runId,
      status: 'imported',
    })

    opts.onInserted()
    opts.onMoved()
  } catch (e: any) {
    opts.onWarn(`Failed importing ${opts.fileName}: ${String(e?.message ?? e)}`)
  }
}

export async function ensureArchiveDirs(permDir: string) {
  await fs.mkdir(
    /*turbopackIgnore: true*/ path.join(
      /*turbopackIgnore: true*/ permDir,
      'legacy-archive',
    ),
    { recursive: true },
  )
}
