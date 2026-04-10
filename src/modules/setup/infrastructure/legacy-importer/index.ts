import fs from 'fs/promises'
import path from 'path'
import type {
  ImportContext,
  ImportResult,
} from '@/src/modules/setup/infrastructure/legacy-importer/types'

import { query } from '@/src/platform/db/postgres'

import { scanAndUpsertPluginCatalog } from '@/src/modules/admin-config/infrastructure/pluginCatalogStore'
import {
  ensureArchiveDirs,
  fileHasContent,
  folderHasJsonFiles,
  pathExists,
} from '@/src/modules/setup/infrastructure/legacy-importer/helpers'
import { importVposConfigAndUsersAndFiscal } from '@/src/modules/setup/infrastructure/legacy-importer/importConfig'
import {
  importEwuraConfigAndRegistration,
  importEwuraFolder,
} from '@/src/modules/setup/infrastructure/legacy-importer/importEwura'
import {
  importCertificates,
  importFiscalDevice,
  importPrinterQueues,
  importRemoteUploadState,
} from '@/src/modules/setup/infrastructure/legacy-importer/importExtras'
import { importQueueFile } from '@/src/modules/setup/infrastructure/legacy-importer/importQueues'
import { importReportsFolder } from '@/src/modules/setup/infrastructure/legacy-importer/importReports'
import {
  importMonolithicTransactionsAndReportsIfPresent,
  importTxnFolder,
} from '@/src/modules/setup/infrastructure/legacy-importer/importTransactions'
import {
  ensureMoveAsideDirs,
  makeRunId,
} from '@/src/modules/setup/infrastructure/legacy-importer/moveAside'
import {
  ARCHIVE_ROOT,
  LEGACY,
  LEGACY_EXTRA,
  VPOS_APP_FILES,
} from '@/src/modules/setup/infrastructure/legacy-importer/types'

export type { ImportResult } from '@/src/modules/setup/infrastructure/legacy-importer/types'

/**
 * Primary entry point.
 * - Uses advisory lock to prevent concurrent import.
 * - Skips quickly if folders/queue files are empty.
 * - Moves successfully imported artifacts to <PERM_DIR>/legacy-archive/<runId>/imported/**.
 */
export async function importLegacyIfPresent(opts: {
  stationId: string
  legacyPermDir: string
  moveAsideRoot?: string
  sourceType?: 'vpos-app' | 'vpos-console' | 'unknown'
}): Promise<ImportResult | null> {
  const { stationId, legacyPermDir } = opts
  const runId = makeRunId()
  const moveAsideRoot =
    opts.moveAsideRoot ?? path.join(legacyPermDir, ARCHIVE_ROOT)
  const sourceType = opts.sourceType ?? 'unknown'
  const ctx: ImportContext = { runId, moveAsideRoot, sourceType }

  await query(`SELECT pg_advisory_lock(hashtext($1))`, [
    `legacy_import:${stationId}`,
  ])
  try {
    if (!(await pathExists(legacyPermDir))) return null

    const hasWork = await hasLegacyWork(legacyPermDir)
    if (!hasWork) return null

    await ensureArchiveDirs(legacyPermDir)
    await ensureMoveAsideDirs(moveAsideRoot, runId)

    const res: ImportResult = {
      inserted: Object.create(null),
      skipped: Object.create(null),
      moved: Object.create(null),
      warnings: [],
    }

    const bump = (obj: Record<string, number>, k: string, n = 1) => {
      obj[k] = (obj[k] || 0) + n
    }

    // 0) Config/users/fiscal
    await importVposConfigAndUsersAndFiscal({
      ctx,
      stationId,
      legacyPermDir,
      onInserted: (k) => bump(res.inserted, k),
      onMoved: (k) => bump(res.moved, k),
      onWarn: (w) => res.warnings.push(w),
    })

    // 0.5) Plugin catalog
    const pluginRoots = [
      path.join(legacyPermDir, 'plugins'),
      path.join(legacyPermDir, 'src', 'plugins'),
    ]
    for (const root of pluginRoots) {
      try {
        const st = await fs.stat(root)
        if (!st.isDirectory()) continue
        const seeded = await scanAndUpsertPluginCatalog(root)
        bump(res.inserted, 'process_catalog', seeded.processes)
        bump(res.inserted, 'plugin_catalog', seeded.plugins)
        for (const w of seeded.warnings) res.warnings.push(w)
        break
      } catch {}
    }

    // 0.75) Monolithic transactions/reports (older vpos-console)
    await importMonolithicTransactionsAndReportsIfPresent({
      ctx,
      stationId,
      legacyPermDir,
      onInserted: (k) => bump(res.inserted, k),
      onSkipped: (k) => bump(res.skipped, k),
      onMoved: (k) => bump(res.moved, k),
      onWarn: (w) => res.warnings.push(w),
    })

    // 1) transactions
    await importTxnFolder({
      ctx,
      stationId,
      legacyPermDir,
      srcFolder: LEGACY.FOLDERS.TRANSACTIONS,
      statusOverride: 'FISCALIZED',
      onInserted: () => bump(res.inserted, 'transactions'),
      onSkipped: () => bump(res.skipped, 'transactions'),
      onMoved: () => bump(res.moved, 'transactions'),
      onWarn: (w) => res.warnings.push(w),
    })

    // 2) pending-transactions
    await importTxnFolder({
      ctx,
      stationId,
      legacyPermDir,
      srcFolder: LEGACY.FOLDERS.PENDING_TRANSACTIONS,
      statusOverride: 'FAILED',
      onInserted: () => bump(res.inserted, 'pending_transactions'),
      onSkipped: () => bump(res.skipped, 'pending_transactions'),
      onMoved: () => bump(res.moved, 'pending_transactions'),
      onWarn: (w) => res.warnings.push(w),
    })

    // 3) transaction queue file
    await importQueueFile({
      ctx,
      stationId,
      legacyPermDir,
      queueFileName: LEGACY.FILES.TRANSACTION_QUEUE,
      kind: 'transaction',
      onInserted: () => bump(res.inserted, 'transaction_queue'),
      onMoved: () => bump(res.moved, 'transaction_queue_file'),
      onWarn: (w) => res.warnings.push(w),
    })

    // 4) reports
    await importReportsFolder({
      ctx,
      stationId,
      legacyPermDir,
      srcFolder: LEGACY.FOLDERS.REPORTS,
      onInserted: () => bump(res.inserted, 'reports'),
      onSkipped: () => bump(res.skipped, 'reports'),
      onMoved: () => bump(res.moved, 'reports'),
      onWarn: (w) => res.warnings.push(w),
    })

    // 5) report queue file
    await importQueueFile({
      ctx,
      stationId,
      legacyPermDir,
      queueFileName: LEGACY.FILES.REPORT_QUEUE,
      kind: 'report',
      onInserted: () => bump(res.inserted, 'report_queue'),
      onMoved: () => bump(res.moved, 'report_queue_file'),
      onWarn: (w) => res.warnings.push(w),
    })

    // 6) EWURA config + registration
    await importEwuraConfigAndRegistration({
      ctx,
      stationId,
      legacyPermDir,
      onInserted: (k) => bump(res.inserted, k),
      onMoved: (k) => bump(res.moved, k),
      onWarn: (w) => res.warnings.push(w),
    })

    // 7) EWURA folders + queues
    await importEwuraFolder({
      ctx,
      stationId,
      legacyPermDir,
      srcFolder: LEGACY.FOLDERS.EWURA_TRANSACTIONS,
      table: 'ewura_transactions',
      queueFileName: LEGACY.FILES.EWURA_TRANSACTIONS_QUEUE,
      kind: 'ewura_transactions',
      onInserted: () => bump(res.inserted, 'ewura_transactions'),
      onSkipped: () => bump(res.skipped, 'ewura_transactions'),
      onMoved: () => bump(res.moved, 'ewura_transactions'),
      onQueueInserted: () => bump(res.inserted, 'ewura_transactions_queue'),
      onQueueMoved: () => bump(res.moved, 'ewura_transactions_queue_file'),
      onWarn: (w) => res.warnings.push(w),
    })

    await importEwuraFolder({
      ctx,
      stationId,
      legacyPermDir,
      srcFolder: LEGACY.FOLDERS.EWURA_REPORTS,
      table: 'ewura_reports',
      queueFileName: LEGACY.FILES.EWURA_REPORTS_QUEUE,
      kind: 'ewura_reports',
      onInserted: () => bump(res.inserted, 'ewura_reports'),
      onSkipped: () => bump(res.skipped, 'ewura_reports'),
      onMoved: () => bump(res.moved, 'ewura_reports'),
      onQueueInserted: () => bump(res.inserted, 'ewura_reports_queue'),
      onQueueMoved: () => bump(res.moved, 'ewura_reports_queue_file'),
      onWarn: (w) => res.warnings.push(w),
    })

    // 8) Certificates
    await importCertificates({
      ctx,
      stationId,
      legacyPermDir,
      onInserted: () => bump(res.inserted, 'certificates'),
      onMoved: () => bump(res.moved, 'cert_files'),
      onWarn: (w) => res.warnings.push(w),
    })

    // 9) Fiscal device
    await importFiscalDevice({
      ctx,
      stationId,
      legacyPermDir,
      onInserted: () => bump(res.inserted, 'fiscal_device'),
      onMoved: () => bump(res.moved, 'fiscal_device_file'),
      onWarn: (w) => res.warnings.push(w),
    })

    // 10) Printer queues
    await importPrinterQueues({
      ctx,
      stationId,
      legacyPermDir,
      onInserted: (k) => bump(res.inserted, k),
      onMoved: () => bump(res.moved, 'printer_queue_files'),
      onWarn: (w) => res.warnings.push(w),
    })

    // 11) Remote upload state
    await importRemoteUploadState({
      ctx,
      stationId,
      legacyPermDir,
      onInserted: (k) => bump(res.inserted, k),
      onMoved: () => bump(res.moved, 'remote_upload_files'),
      onWarn: (w) => res.warnings.push(w),
    })

    return res
  } finally {
    await query(`SELECT pg_advisory_unlock(hashtext($1))`, [
      `legacy_import:${stationId}`,
    ])
  }
}

/* ------------------------------ precheck ------------------------------ */

async function hasLegacyWork(permDir: string): Promise<boolean> {
  const folders = [
    LEGACY.FOLDERS.TRANSACTIONS,
    LEGACY.FOLDERS.PENDING_TRANSACTIONS,
    LEGACY.FOLDERS.REPORTS,
    LEGACY.FOLDERS.EWURA_TRANSACTIONS,
    LEGACY.FOLDERS.EWURA_REPORTS,
  ]

  for (const f of folders) {
    const p = path.join(permDir, f)
    if (await folderHasJsonFiles(p)) return true
  }

  const queueFiles = [
    VPOS_APP_FILES.USERS,
    VPOS_APP_FILES.VPOS_CONFIG,
    VPOS_APP_FILES.ENGINE_CONFIG,
    VPOS_APP_FILES.FISCAL_CONFIG,
    VPOS_APP_FILES.FISCAL_REGISTRATION,
    LEGACY.FILES.TRANSACTION_QUEUE,
    LEGACY.FILES.REPORT_QUEUE,
    LEGACY.FILES.EWURA_TRANSACTIONS_QUEUE,
    LEGACY.FILES.EWURA_REPORTS_QUEUE,
    LEGACY.FILES.EWURA_CONFIG,
    LEGACY.FILES.EWURA_REGISTRATION,
  ]

  for (const name of queueFiles) {
    const fp = path.join(permDir, name)
    if (await fileHasContent(fp)) return true
  }

  const extraFiles = [
    path.join(permDir, LEGACY_EXTRA.FISCAL_DEVICE),
    path.join(permDir, LEGACY_EXTRA.PRINTER_TRANSACTION_QUEUE),
    path.join(permDir, LEGACY_EXTRA.PRINTER_REPORT_QUEUE),
    path.join(permDir, LEGACY_EXTRA.REMOTE_UPLOAD_QUEUE),
    path.join(permDir, LEGACY_EXTRA.REMOTE_UPLOAD_STATUS),
    path.join(permDir, LEGACY_EXTRA.CERT_DIR, LEGACY_EXTRA.CERT_PFX),
    path.join(permDir, LEGACY_EXTRA.CERT_DIR, LEGACY_EXTRA.CERT_PASS),
  ]
  for (const fp of extraFiles) {
    if (await fileHasContent(fp)) return true
  }

  return false
}
