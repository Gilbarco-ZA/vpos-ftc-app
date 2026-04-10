import fs from 'fs/promises'
import path from 'path'
import type { ImportContext } from '@/src/modules/setup/infrastructure/legacy-importer/types'

import { query } from '@/src/platform/db/postgres'
import { toNumberLoose, toNumberOr } from '@/src/shared/numbers'
import { toDateTime } from '@/src/shared/utils/dates'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  existsByLegacyFilename,
  fileHasContent,
  folderHasJsonFiles,
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
import {
  LEGACY,
  VPOS_CONSOLE_MONOLITH,
} from '@/src/modules/setup/infrastructure/legacy-importer/types'

export async function importMonolithicTransactionsAndReportsIfPresent(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  onInserted: (k: string) => void
  onSkipped: (k: string) => void
  onMoved: (k: string) => void
  onWarn: (w: string) => void
}) {
  const {
    ctx,
    stationId,
    legacyPermDir,
    onInserted,
    onSkipped,
    onMoved,
    onWarn,
  } = opts

  const txFolder = path.join(legacyPermDir, LEGACY.FOLDERS.TRANSACTIONS)
  const reportsFolder = path.join(legacyPermDir, LEGACY.FOLDERS.REPORTS)

  const hasTxFolderLayout = await folderHasJsonFiles(txFolder)
  const hasReportsFolderLayout = await folderHasJsonFiles(reportsFolder)

  if (!hasTxFolderLayout) {
    await importMonolithicTransactionsFile({
      ctx,
      stationId,
      legacyPermDir,
      fileName: VPOS_CONSOLE_MONOLITH.TRANSACTIONS,
      statusOverride: 'FISCALIZED',
      onInserted: () => onInserted('transactions'),
      onSkipped: () => onSkipped('transactions'),
      onMoved: () => onMoved('transactions_monolith_file'),
      onWarn,
    })
  }

  if (!hasReportsFolderLayout) {
    await importMonolithicReportsFile({
      ctx,
      stationId,
      legacyPermDir,
      fileName: VPOS_CONSOLE_MONOLITH.REPORTS,
      onInserted: () => onInserted('reports'),
      onSkipped: () => onSkipped('reports'),
      onMoved: () => onMoved('reports_monolith_file'),
      onWarn,
    })
  }
}

async function importMonolithicTransactionsFile(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  fileName: string
  statusOverride: string
  onInserted: () => void
  onSkipped: () => void
  onMoved: () => void
  onWarn: (w: string) => void
}) {
  const {
    ctx,
    stationId,
    legacyPermDir,
    fileName,
    statusOverride,
    onInserted,
    onSkipped,
    onMoved,
    onWarn,
  } = opts
  const filePath = path.join(legacyPermDir, fileName)
  if (!(await pathExists(filePath))) return

  try {
    const meta = await getFileMeta(filePath)
    const sha = await sha256File(filePath)
    const rel = relativeToPermDir(legacyPermDir, filePath) ?? fileName

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
        fileName,
        fileSize: meta.size,
        fileMtime: meta.mtime,
        sha256: sha,
        status: 'skipped',
        movedToPath: moved.movedTo,
        importRunId: ctx.runId,
      })
      onSkipped()
      onMoved()
      return
    }

    const json = await safeReadJson(filePath)
    if (!json) {
      onWarn(`Could not parse JSON: ${filePath}`)
      return
    }

    const arr = Array.isArray(json)
      ? json
      : Array.isArray(json.data)
        ? json.data
        : null
    if (!arr) {
      onWarn(`Unexpected monolithic transactions format: ${filePath}`)
      return
    }

    let inserted = 0
    let skipped = 0

    for (let i = 0; i < arr.length; i++) {
      const vfd = arr[i]?.data ? arr[i].data : arr[i]
      if (!vfd) continue

      const legacyFilename = `${fileName}#${i + 1}`

      if (
        await existsByLegacyFilename('transactions', stationId, legacyFilename)
      ) {
        skipped++
        continue
      }

      const tx = vfd.transaction || {}
      const details = tx.details || {}
      const totals = tx.totals || {}
      const items = Array.isArray(tx.items) ? tx.items : []

      const transactionDateTime = toDateTime(tx.date, tx.time, meta.mtime)
      const pumpNumber =
        parseInt(details.pumpNumber ?? details.pump_number ?? 0, 10) || 0
      const volume = toNumberLoose(details.pumpVolume ?? details.pump_volume)
      const totalAmount = toNumberOr(
        totals.totalIncludingTax ?? totals.total_including_tax,
        0,
      )

      const fuelType =
        (items[0] && (items[0].description || items[0].type)) ||
        tx.fuelType ||
        null

      const posReference =
        tx.receiptNo !== undefined
          ? String(tx.receiptNo).trim().toUpperCase()
          : tx.globalCount !== undefined
            ? String(tx.globalCount).trim().toUpperCase()
            : null

      const fiscalRef = tx.receiptVerificationNo || null

      try {
        await query(
          `
        INSERT INTO transactions (
          id, station_id, customer_id, pump_number, transaction_date_time, total_amount, volume,
          fuel_type, pos_reference, status, fiscalization_reference, fiscalization_response,
          legacy_filename, created_at, updated_at
        )
        VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        `,
          [
            uuidv4(),
            stationId,
            pumpNumber,
            transactionDateTime,
            totalAmount,
            volume,
            fuelType,
            posReference,
            statusOverride,
            fiscalRef,
            vfd,
            legacyFilename,
          ],
        )
        inserted++
      } catch (e: any) {
        onWarn(
          `Failed inserting monolithic transaction ${legacyFilename}: ${e?.message || e}`,
        )
      }
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
      fileName,
      fileSize: meta.size,
      fileMtime: meta.mtime,
      sha256: sha,
      status: inserted > 0 ? 'imported' : 'skipped',
      movedToPath: moved.movedTo,
      importRunId: ctx.runId,
    })

    for (let j = 0; j < inserted; j++) onInserted()
    for (let j = 0; j < skipped; j++) onSkipped()
    onMoved()
  } catch (e: any) {
    onWarn(`Failed importing ${filePath}: ${String(e?.message ?? e)}`)
  }
}

async function importMonolithicReportsFile(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  fileName: string
  onInserted: () => void
  onSkipped: () => void
  onMoved: () => void
  onWarn: (w: string) => void
}) {
  const {
    ctx,
    stationId,
    legacyPermDir,
    fileName,
    onInserted,
    onSkipped,
    onMoved,
    onWarn,
  } = opts
  const filePath = path.join(legacyPermDir, fileName)
  if (!(await pathExists(filePath))) return

  try {
    const meta = await getFileMeta(filePath)
    const sha = await sha256File(filePath)
    const rel = relativeToPermDir(legacyPermDir, filePath) ?? fileName

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
        fileName,
        fileSize: meta.size,
        fileMtime: meta.mtime,
        sha256: sha,
        status: 'skipped',
        movedToPath: moved.movedTo,
        importRunId: ctx.runId,
      })
      onSkipped()
      onMoved()
      return
    }

    const json = await safeReadJson(filePath)
    if (!json) {
      onWarn(`Could not parse JSON: ${filePath}`)
      return
    }

    const arr = Array.isArray(json)
      ? json
      : Array.isArray(json.data)
        ? json.data
        : null
    if (!arr) {
      onWarn(`Unexpected monolithic reports format: ${filePath}`)
      return
    }

    let inserted = 0
    let skipped = 0

    for (let i = 0; i < arr.length; i++) {
      const fileObj = arr[i]?.data ? arr[i].data : arr[i]
      if (!fileObj) continue

      const legacyFilename = `${fileName}#${i + 1}`
      if (await existsByLegacyFilename('reports', stationId, legacyFilename)) {
        skipped++
        continue
      }

      const report = (fileObj.report || fileObj) as any
      const reportDateTime = toDateTime(report?.date, report?.time, meta.mtime)
      const reportType = report?.znum !== undefined ? 'ZREPORT' : 'UNKNOWN'

      try {
        await query(
          `
        INSERT INTO reports (
          id, station_id, report_date_time, report_type, payload, status, legacy_filename, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, NOW(), NOW())
        `,
          [
            uuidv4(),
            stationId,
            reportDateTime,
            reportType,
            fileObj,
            legacyFilename,
          ],
        )
        inserted++
      } catch (e: any) {
        onWarn(
          `Failed inserting monolithic report ${legacyFilename}: ${e?.message || e}`,
        )
      }
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
      fileName,
      fileSize: meta.size,
      fileMtime: meta.mtime,
      sha256: sha,
      status: inserted > 0 ? 'imported' : 'skipped',
      movedToPath: moved.movedTo,
      importRunId: ctx.runId,
    })

    for (let j = 0; j < inserted; j++) onInserted()
    for (let j = 0; j < skipped; j++) onSkipped()
    onMoved()
  } catch (e: any) {
    onWarn(`Failed importing ${filePath}: ${String(e?.message ?? e)}`)
  }
}

export async function importTxnFolder(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  srcFolder: string
  statusOverride: string
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
    statusOverride,
    onInserted,
    onSkipped,
    onMoved,
    onWarn,
  } = opts
  const dir = path.join(legacyPermDir, srcFolder)
  if (!(await pathExists(dir))) return

  const files = (await fs.readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
    .map((e) => e.name)
    .sort()

  for (const filename of files) {
    const filePath = path.join(dir, filename)
    const meta = await getFileMeta(filePath)
    const sha = await sha256File(filePath)
    const rel =
      relativeToPermDir(legacyPermDir, filePath) ??
      path.join(srcFolder, filename)

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

    if (await existsByLegacyFilename('transactions', stationId, filename)) {
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

    const vfd = json.data ? json.data : json
    const tx = vfd.transaction || {}
    const details = tx.details || {}
    const totals = tx.totals || {}
    const items = Array.isArray(tx.items) ? tx.items : []
    const stat = await fs.stat(filePath)

    const transactionDateTime = toDateTime(tx.date, tx.time, stat.mtime)
    const pumpNumber =
      parseInt(details.pumpNumber ?? details.pump_number ?? 0, 10) || 0
    const volume = toNumberLoose(details.pumpVolume ?? details.pump_volume)
    const totalAmount = toNumberOr(
      totals.totalIncludingTax ?? totals.total_including_tax,
      0,
    )

    const fuelType =
      (items[0] && (items[0].description || items[0].type)) ||
      tx.fuelType ||
      null

    const posReference =
      tx.receiptNo !== undefined
        ? String(tx.receiptNo)
        : tx.globalCount !== undefined
          ? String(tx.globalCount)
          : null

    const fiscalRef = tx.receiptVerificationNo || null
    try {
      await query(
        `
      INSERT INTO transactions (
        id, station_id, customer_id, pump_number, transaction_date_time, total_amount, volume,
        fuel_type, pos_reference, status, fiscalization_reference, fiscalization_response,
        legacy_filename, created_at, updated_at
      )
      VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      `,
        [
          uuidv4(),
          stationId,
          pumpNumber,
          transactionDateTime,
          totalAmount,
          volume,
          fuelType,
          posReference,
          statusOverride,
          fiscalRef,
          vfd,
          filename,
        ],
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
