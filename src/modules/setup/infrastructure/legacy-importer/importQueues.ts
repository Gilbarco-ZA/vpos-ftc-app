import path from 'path'
import type { ImportContext } from '@/src/modules/setup/infrastructure/legacy-importer/types'

import { query } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
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

export async function importQueueFile(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  queueFileName: string
  kind: 'transaction' | 'report'
  onInserted: () => void
  onMoved: () => void
  onWarn: (w: string) => void
}) {
  const {
    ctx,
    stationId,
    legacyPermDir,
    queueFileName,
    kind,
    onInserted,
    onMoved,
    onWarn,
  } = opts

  const filePath = path.join(legacyPermDir, queueFileName)
  if (!(await pathExists(filePath))) return

  const meta = await getFileMeta(filePath)
  const sha = await sha256File(filePath)
  const rel = relativeToPermDir(legacyPermDir, filePath) ?? queueFileName

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
      fileName: path.basename(filePath),
      fileSize: meta.size,
      fileMtime: meta.mtime,
      sha256: sha,
      status: 'skipped',
      movedToPath: moved.movedTo,
    })
    onMoved()
    return
  }

  const json = await safeReadJson(filePath)
  if (!json) {
    onWarn(`Could not parse JSON: ${filePath}`)
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
      fileName: path.basename(filePath),
      fileSize: meta.size,
      fileMtime: meta.mtime,
      sha256: sha,
      status: 'failed',
      errorMessage: 'Invalid JSON',
      movedToPath: moved.movedTo,
    })
    onMoved()
    return
  }

  const root = json.data ? json.data : json

  try {
    if (kind === 'transaction') {
      const items = Array.isArray(root.transactions) ? root.transactions : []
      for (const item of items) {
        await query(
          `INSERT INTO transaction_queue (id, station_id, status, payload) VALUES ($1, $2, 'PENDING', $3)`,
          [uuidv4(), stationId, item],
        )
        onInserted()
      }
    } else {
      const items = Array.isArray(root.reports) ? root.reports : []
      for (const item of items) {
        await query(
          `INSERT INTO report_queue (id, station_id, status, payload) VALUES ($1, $2, 'PENDING', $3)`,
          [uuidv4(), stationId, item],
        )
        onInserted()
      }
    }
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
      fileName: path.basename(filePath),
      fileSize: meta.size,
      fileMtime: meta.mtime,
      sha256: sha,
      status: 'failed',
      errorMessage: e?.message || String(e),
      movedToPath: moved.movedTo,
    })
    onWarn(`Import failed for ${filePath}: ${e?.message || e}`)
    onMoved()
    return
  }

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
    fileName: path.basename(filePath),
    fileSize: meta.size,
    fileMtime: meta.mtime,
    sha256: sha,
    status: 'imported',
    movedToPath: moved.movedTo,
  })
  onMoved()
}
