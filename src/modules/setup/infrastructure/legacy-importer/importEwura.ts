import fs from 'fs/promises'
import path from 'path'
import type { ImportContext } from '@/src/modules/setup/infrastructure/legacy-importer/types'

import { query } from '@/src/platform/db/postgres'
import { kvSet } from '@/src/shared/storage/stationKv'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  ewuraExistsByLegacyFilename,
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
import { LEGACY } from '@/src/modules/setup/infrastructure/legacy-importer/types'
import {
  extractFiscalTzQueueItems,
  fiscalTzArtifactKvValue,
} from '@/src/modules/tanzania-fiscal/infrastructure/fiscalTzLegacy'

export async function importEwuraConfigAndRegistration(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  onInserted: (k: string) => void
  onMoved: (k: string) => void
  onWarn: (w: string) => void
}) {
  const { ctx, stationId, legacyPermDir, onInserted, onMoved, onWarn } = opts

  // ewura.config.json -> ewura_config
  {
    const name = LEGACY.FILES.EWURA_CONFIG
    const fp = path.join(/*turbopackIgnore: true*/ legacyPermDir, name)

    if (await pathExists(fp)) {
      const meta = await getFileMeta(fp)
      const sha = await sha256File(fp)
      const rel = relativeToPermDir(legacyPermDir, fp) ?? name

      const prior = await ledgerFind(stationId, sha, meta.size)
      if (
        prior &&
        (prior.status === 'imported' || prior.status === 'skipped')
      ) {
        const moved = await moveAside({
          moveRoot: ctx.moveAsideRoot,
          runId: ctx.runId,
          status: 'imported',
          relativePath: rel,
          from: fp,
        })
        await ledgerUpsert({
          stationId,
          sourceType: ctx.sourceType,
          sourcePath: fp,
          relativePath: rel,
          fileName: name,
          fileSize: meta.size,
          fileMtime: meta.mtime,
          sha256: sha,
          status: 'skipped',
          movedToPath: moved.movedTo,
        })
        onMoved('ewura_config')
      } else {
        const json = await safeReadJson(fp)
        if (!json) {
          onWarn(`Could not parse JSON: ${fp}`)
          const moved = await moveAside({
            moveRoot: ctx.moveAsideRoot,
            runId: ctx.runId,
            status: 'failed',
            relativePath: rel,
            from: fp,
          })
          await ledgerUpsert({
            stationId,
            sourceType: ctx.sourceType,
            sourcePath: fp,
            relativePath: rel,
            fileName: name,
            fileSize: meta.size,
            fileMtime: meta.mtime,
            sha256: sha,
            status: 'failed',
            errorMessage: 'Invalid JSON',
            movedToPath: moved.movedTo,
          })
          onMoved('ewura_config')
        } else {
          await query(
            `
						INSERT INTO ewura_config (station_id, config_json)
						VALUES ($1, $2)
						ON CONFLICT (station_id)
						DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = CURRENT_TIMESTAMP
						`,
            [stationId, json],
          )
          await kvSet(
            stationId,
            'vpos.ewura.config',
            fiscalTzArtifactKvValue(name, json),
          )
          onInserted('ewura_config')

          const moved = await moveAside({
            moveRoot: ctx.moveAsideRoot,
            runId: ctx.runId,
            status: 'imported',
            relativePath: rel,
            from: fp,
          })
          await ledgerUpsert({
            stationId,
            sourceType: ctx.sourceType,
            sourcePath: fp,
            relativePath: rel,
            fileName: name,
            fileSize: meta.size,
            fileMtime: meta.mtime,
            sha256: sha,
            status: 'imported',
            movedToPath: moved.movedTo,
          })
          onMoved('ewura_config')
        }
      }
    }
  }

  // ewura.registration.json -> ewura_registration
  {
    const name = LEGACY.FILES.EWURA_REGISTRATION
    const fp = path.join(/*turbopackIgnore: true*/ legacyPermDir, name)

    if (await pathExists(fp)) {
      const meta = await getFileMeta(fp)
      const sha = await sha256File(fp)
      const rel = relativeToPermDir(legacyPermDir, fp) ?? name

      const prior = await ledgerFind(stationId, sha, meta.size)
      if (
        prior &&
        (prior.status === 'imported' || prior.status === 'skipped')
      ) {
        const moved = await moveAside({
          moveRoot: ctx.moveAsideRoot,
          runId: ctx.runId,
          status: 'imported',
          relativePath: rel,
          from: fp,
        })
        await ledgerUpsert({
          stationId,
          sourceType: ctx.sourceType,
          sourcePath: fp,
          relativePath: rel,
          fileName: name,
          fileSize: meta.size,
          fileMtime: meta.mtime,
          sha256: sha,
          status: 'skipped',
          movedToPath: moved.movedTo,
        })
        onMoved('ewura_registration')
      } else {
        const json = await safeReadJson(fp)
        if (!json) {
          onWarn(`Could not parse JSON: ${fp}`)
          const moved = await moveAside({
            moveRoot: ctx.moveAsideRoot,
            runId: ctx.runId,
            status: 'failed',
            relativePath: rel,
            from: fp,
          })
          await ledgerUpsert({
            stationId,
            sourceType: ctx.sourceType,
            sourcePath: fp,
            relativePath: rel,
            fileName: name,
            fileSize: meta.size,
            fileMtime: meta.mtime,
            sha256: sha,
            status: 'failed',
            errorMessage: 'Invalid JSON',
            movedToPath: moved.movedTo,
          })
          onMoved('ewura_registration')
        } else {
          const status = (json.status || json.state || 'PENDING') as string
          const registeredAt = json.registeredAt || json.registered_at || null

          await query(
            `
						INSERT INTO ewura_registration (id, station_id, status, registration_json, registered_at)
						VALUES ($1, $2, $3, $4, $5)
						ON CONFLICT (station_id)
						DO UPDATE SET
							status = EXCLUDED.status,
							registration_json = EXCLUDED.registration_json,
							registered_at = EXCLUDED.registered_at,
							updated_at = CURRENT_TIMESTAMP
						`,
            [
              uuidv4(),
              stationId,
              status,
              json,
              registeredAt ? new Date(registeredAt) : null,
            ],
          )
          await kvSet(
            stationId,
            'vpos.ewura.registration',
            fiscalTzArtifactKvValue(name, json),
          )

          onInserted('ewura_registration')

          const moved = await moveAside({
            moveRoot: ctx.moveAsideRoot,
            runId: ctx.runId,
            status: 'imported',
            relativePath: rel,
            from: fp,
          })
          await ledgerUpsert({
            stationId,
            sourceType: ctx.sourceType,
            sourcePath: fp,
            relativePath: rel,
            fileName: name,
            fileSize: meta.size,
            fileMtime: meta.mtime,
            sha256: sha,
            status: 'imported',
            movedToPath: moved.movedTo,
          })
          onMoved('ewura_registration')
        }
      }
    }
  }
}

export async function importEwuraFolder(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  srcFolder: string
  table: 'ewura_transactions' | 'ewura_reports'
  queueFileName: string
  kind: 'ewura_transactions' | 'ewura_reports'
  onInserted: () => void
  onSkipped: () => void
  onMoved: () => void
  onQueueInserted: () => void
  onQueueMoved: () => void
  onWarn: (w: string) => void
}) {
  const {
    ctx,
    stationId,
    legacyPermDir,
    srcFolder,
    table,
    onInserted,
    onSkipped,
    onMoved,
    onQueueInserted,
    onQueueMoved,
    onWarn,
  } = opts

  // Folder files
  {
    const dir = path.join(/*turbopackIgnore: true*/ legacyPermDir, srcFolder)
    if (await pathExists(dir)) {
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
        if (
          prior &&
          (prior.status === 'imported' || prior.status === 'skipped')
        ) {
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

        const already = await ewuraExistsByLegacyFilename(
          table,
          stationId,
          filename,
        )
        if (already) {
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

        const stat = await fs.stat(/*turbopackIgnore: true*/ filePath)
        const payload = { ...json, _legacyFilename: filename }
        try {
          if (table === 'ewura_transactions') {
            await query(
              `
            INSERT INTO ewura_transactions (
              id, station_id, transaction_id, ewura_reference, status,
              payload_json, legacy_source_key, created_at, updated_at
            )
            VALUES ($1, $2, NULL, NULL, 'PENDING', $3::jsonb, $4, $5, $5)
            ON CONFLICT (station_id, legacy_source_key)
            WHERE legacy_source_key IS NOT NULL
            DO UPDATE SET payload_json = EXCLUDED.payload_json,
                          updated_at = NOW()
            `,
              [
                uuidv4(),
                stationId,
                JSON.stringify(payload),
                `vpos-fiscal-tz|${srcFolder}|${filename}`,
                stat.mtime,
              ],
            )
          } else {
            const reportDate =
              payload.report_date ||
              payload.date ||
              payload.reportDate ||
              payload.report_date_time ||
              null

            await query(
              `
            INSERT INTO ewura_reports (
              id, station_id, report_date, ewura_reference, status,
              payload_json, legacy_source_key, created_at, updated_at
            )
            VALUES ($1, $2, $3, NULL, 'PENDING', $4::jsonb, $5, $6, $6)
            ON CONFLICT (station_id, legacy_source_key)
            WHERE legacy_source_key IS NOT NULL
            DO UPDATE SET payload_json = EXCLUDED.payload_json,
                          report_date = COALESCE(EXCLUDED.report_date, ewura_reports.report_date),
                          updated_at = NOW()
            `,
              [
                uuidv4(),
                stationId,
                reportDate ? new Date(reportDate) : null,
                JSON.stringify(payload),
                `vpos-fiscal-tz|${srcFolder}|${filename}`,
                stat.mtime,
              ],
            )
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
  }

  // Queue files (ledger + moveAside), including rotated *.old* retry files.
  for (const queueFileName of await findLegacyQueueFiles(
    legacyPermDir,
    opts.queueFileName,
  )) {
    const filePath = path.join(
      /*turbopackIgnore: true*/ legacyPermDir,
      queueFileName,
    )
    if (!(await pathExists(filePath))) continue

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
      onQueueMoved()
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
      onQueueMoved()
      return
    }

    const items = extractFiscalTzQueueItems({
      stationId,
      fileName: queueFileName,
      kind:
        table === 'ewura_transactions' ? 'ewura_transaction' : 'ewura_report',
      json,
    })

    try {
      for (const item of items) {
        const payload = item.payload
        if (table === 'ewura_transactions') {
          await query(
            `
          INSERT INTO ewura_transactions (
            id, station_id, transaction_id, ewura_reference, status,
            payload_json, source_queue_id, legacy_source_key
          )
          VALUES ($1, $2, NULL, NULL, $3, $4::jsonb, NULL, $5)
          ON CONFLICT (station_id, legacy_source_key)
          WHERE legacy_source_key IS NOT NULL
          DO UPDATE SET status = CASE
                           WHEN ewura_transactions.status = 'SENT'
                           THEN ewura_transactions.status
                           ELSE EXCLUDED.status
                         END,
                        payload_json = EXCLUDED.payload_json,
                        updated_at = NOW()
          `,
            [
              uuidv4(),
              stationId,
              item.status,
              JSON.stringify(payload),
              item.sourceKey,
            ],
          )
        } else {
          const reportDate =
            payload.report_date ||
            payload.date ||
            payload.reportDate ||
            payload.report_date_time ||
            null

          await query(
            `
          INSERT INTO ewura_reports (
            id, station_id, report_date, ewura_reference, status,
            payload_json, source_queue_id, legacy_source_key
          )
          VALUES ($1, $2, $3, NULL, $4, $5::jsonb, NULL, $6)
          ON CONFLICT (station_id, legacy_source_key)
          WHERE legacy_source_key IS NOT NULL
          DO UPDATE SET status = CASE
                           WHEN ewura_reports.status = 'SENT'
                           THEN ewura_reports.status
                           ELSE EXCLUDED.status
                         END,
                        report_date = COALESCE(EXCLUDED.report_date, ewura_reports.report_date),
                        payload_json = EXCLUDED.payload_json,
                        updated_at = NOW()
          `,
            [
              uuidv4(),
              stationId,
              reportDate ? new Date(String(reportDate)) : null,
              item.status,
              JSON.stringify(payload),
              item.sourceKey,
            ],
          )
        }
        onQueueInserted()
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
      onQueueMoved()
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
    onQueueMoved()
  }
}

async function findLegacyQueueFiles(permDir: string, baseName: string) {
  try {
    const entries = await fs.readdir(/*turbopackIgnore: true*/ permDir, {
      withFileTypes: true,
    })
    const prefix = baseName.replace(/\.json$/i, '')
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => {
        const lower = name.toLowerCase()
        return (
          lower === baseName.toLowerCase() ||
          lower.startsWith(`${prefix.toLowerCase()}.old`) ||
          lower.startsWith(`${prefix.toLowerCase()}.old_`)
        )
      })
      .sort((a, b) => {
        if (a === baseName) return -1
        if (b === baseName) return 1
        return a.localeCompare(b)
      })
  } catch {
    return []
  }
}
