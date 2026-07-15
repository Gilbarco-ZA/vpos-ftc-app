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
import { extractFiscalTzQueueItems } from '@/src/modules/tanzania-fiscal/infrastructure/fiscalTzLegacy'

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

  const filePath = path.join(
    /*turbopackIgnore: true*/ legacyPermDir,
    queueFileName,
  )
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

  try {
    const items = extractFiscalTzQueueItems({
      stationId,
      fileName: queueFileName,
      kind,
      json,
    })

    if (kind === 'transaction') {
      for (const item of items) {
        await query(
          `INSERT INTO transaction_queue (
              id, station_id, status, payload, retry_count, last_error,
              legacy_source_key
            )
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
            ON CONFLICT (station_id, legacy_source_key)
            WHERE legacy_source_key IS NOT NULL
            DO UPDATE SET status = CASE
                             WHEN transaction_queue.status = 'DONE'
                             THEN transaction_queue.status
                             ELSE EXCLUDED.status
                           END,
                          payload = EXCLUDED.payload,
                          retry_count = GREATEST(transaction_queue.retry_count, EXCLUDED.retry_count),
                          last_error = COALESCE(transaction_queue.last_error, EXCLUDED.last_error),
                          updated_at = NOW()`,
          [
            uuidv4(),
            stationId,
            item.status,
            JSON.stringify(item.payload),
            item.retryCount,
            item.lastError,
            item.sourceKey,
          ],
        )
        onInserted()
      }
    } else {
      for (const item of items) {
        await query(
          `INSERT INTO report_queue (
              id, station_id, status, payload, retry_count, last_error,
              legacy_source_key
            )
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
            ON CONFLICT (station_id, legacy_source_key)
            WHERE legacy_source_key IS NOT NULL
            DO UPDATE SET status = CASE
                             WHEN report_queue.status = 'DONE'
                             THEN report_queue.status
                             ELSE EXCLUDED.status
                           END,
                          payload = EXCLUDED.payload,
                          retry_count = GREATEST(report_queue.retry_count, EXCLUDED.retry_count),
                          last_error = COALESCE(report_queue.last_error, EXCLUDED.last_error),
                          updated_at = NOW()`,
          [
            uuidv4(),
            stationId,
            item.status,
            JSON.stringify(item.payload),
            item.retryCount,
            item.lastError,
            item.sourceKey,
          ],
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
