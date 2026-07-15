import fs from 'fs/promises'
import path from 'path'
import type { ImportContext } from '@/src/modules/setup/infrastructure/legacy-importer/types'

import { query } from '@/src/platform/db/postgres'
import { toDateTime } from '@/src/shared/utils/dates'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  existsByLegacyFilename,
  markSkippedAndMove,
  pathExists,
  safeReadJson,
} from '@/src/modules/setup/infrastructure/legacy-importer/helpers'
import {
  getFileMeta,
  ledgerFind,
  ledgerUpsert,
  relativeToPermDir,
  sha256File,
} from '@/src/modules/setup/infrastructure/legacy-importer/ledger'
import { moveAside } from '@/src/modules/setup/infrastructure/legacy-importer/moveAside'

export async function importReportsFolder(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  srcFolder: string
  onInserted: () => void
  onSkipped: () => void
  onMoved: () => void
  onWarn: (w: string) => void
}) {
  const {
    ctx,
    stationId,
    legacyPermDir,
    srcFolder,
    onInserted,
    onSkipped,
    onMoved,
    onWarn,
  } = opts
  const dir = path.join(/*turbopackIgnore: true*/ legacyPermDir, srcFolder)
  if (!(await pathExists(dir))) return

  const files = (
    await fs.readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
  )
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
    .map((e) => e.name)
    .sort()

  for (const filename of files) {
    const filePath = path.join(/*turbopackIgnore: true*/ dir, filename)
    const meta = await getFileMeta(filePath)
    const sha = await sha256File(filePath)
    const rel =
      relativeToPermDir(legacyPermDir, filePath) ??
      path.join(/*turbopackIgnore: true*/ srcFolder, filename)

    const prior = await ledgerFind(stationId, sha, meta.size)
    if (prior && (prior.status === 'imported' || prior.status === 'skipped')) {
      const moved = await moveAside({
        moveRoot: ctx.moveAsideRoot,
        runId: ctx.runId,
        status: 'imported',
        relativePath: rel,
        from: filePath,
      })
      await ledgerUpsert({
        stationId,
        sourceType: ctx.sourceType,
        sourcePath: filePath,
        relativePath: rel,
        fileName: filename,
        fileSize: meta.size,
        fileMtime: meta.mtime,
        sha256: sha,
        status: 'skipped',
        movedToPath: moved.movedTo,
      })
      onSkipped()
      onMoved()
      continue
    }

    const json = await safeReadJson(filePath)
    if (!json) {
      onWarn(`Could not parse JSON: ${filePath}`)
      continue
    }

    if (await existsByLegacyFilename('reports', stationId, filename)) {
      await markSkippedAndMove({
        ctx,
        stationId,
        sourcePath: filePath,
        relativePath: rel,
        fileName: filename,
        fileSize: meta.size,
        fileMtime: meta.mtime,
        sha256: sha,
      })
      onSkipped()
      onMoved()
      continue
    }

    const fileObj = json.data ? json.data : json
    const report = fileObj.report || fileObj
    const stat = await fs.stat(/*turbopackIgnore: true*/ filePath)
    const reportDateTime = toDateTime(report.date, report.time, stat.mtime)

    const reportType = report?.znum !== undefined ? 'ZREPORT' : 'UNKNOWN'
    try {
      await query(
        `
      INSERT INTO reports (
        id, station_id, report_date_time, report_type, payload, status, legacy_filename, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, NOW(), NOW())
      `,
        [uuidv4(), stationId, reportDateTime, reportType, fileObj, filename],
      )
    } catch (e: any) {
      const moved = await moveAside({
        moveRoot: ctx.moveAsideRoot,
        runId: ctx.runId,
        status: 'failed',
        relativePath: rel,
        from: filePath,
      })
      await ledgerUpsert({
        stationId,
        sourceType: ctx.sourceType,
        sourcePath: filePath,
        relativePath: rel,
        fileName: filename,
        fileSize: meta.size,
        fileMtime: meta.mtime,
        sha256: sha,
        status: 'failed',
        errorMessage: e?.message || String(e),
        movedToPath: moved.movedTo,
      })
      onWarn(`Import failed for ${filePath}: ${e?.message || e}`)
      continue
    }

    onInserted()
    const moved = await moveAside({
      moveRoot: ctx.moveAsideRoot,
      runId: ctx.runId,
      status: 'imported',
      relativePath: rel,
      from: filePath,
    })

    await ledgerUpsert({
      stationId,
      sourceType: ctx.sourceType,
      sourcePath: filePath,
      relativePath: rel,
      fileName: filename,
      fileSize: meta.size,
      fileMtime: meta.mtime,
      sha256: sha,
      status: 'imported',
      movedToPath: moved.movedTo,
    })
    onMoved()
  }
}
