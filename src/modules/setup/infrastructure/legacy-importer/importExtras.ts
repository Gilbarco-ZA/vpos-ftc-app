import fs from 'fs/promises'
import path from 'path'
import type { ImportContext } from '@/src/modules/setup/infrastructure/legacy-importer/types'

import { upsertSecureArtifact } from '@/src/platform/security/secure-artifacts'
import { enqueuePrintJob } from '@/src/shared/print/queue'
import { kvSet } from '@/src/shared/storage/stationKv'

import {
  fileHasContent,
  importSingleJsonFile,
  markSkippedAndMove,
} from '@/src/modules/setup/infrastructure/legacy-importer/helpers'
import {
  getFileMeta,
  ledgerFind,
  ledgerUpsert,
  relativeToPermDir,
  sha256File,
} from '@/src/modules/setup/infrastructure/legacy-importer/ledger'
import { moveAside } from '@/src/modules/setup/infrastructure/legacy-importer/moveAside'
import { LEGACY_EXTRA } from '@/src/modules/setup/infrastructure/legacy-importer/types'

export async function importCertificates(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  onInserted: () => void
  onMoved: () => void
  onWarn: (w: string) => void
}) {
  const { ctx, stationId, legacyPermDir } = opts
  const certDir = path.join(legacyPermDir, LEGACY_EXTRA.CERT_DIR)
  const pfxPath = path.join(certDir, LEGACY_EXTRA.CERT_PFX)
  const passPath = path.join(certDir, LEGACY_EXTRA.CERT_PASS)

  const hasPfx = await fileHasContent(pfxPath)
  const hasPass = await fileHasContent(passPath)
  if (!hasPfx && !hasPass) return

  if (!(process.env.SECURE_ARTIFACTS_MASTER_KEY || '').trim()) {
    opts.onWarn(
      `Found legacy cert files but SECURE_ARTIFACTS_MASTER_KEY is not set; skipping cert import and leaving files in place.`,
    )
    return
  }

  const importOne = async (filePath: string, artifactKey: string) => {
    if (!(await fileHasContent(filePath))) return
    const meta = await getFileMeta(filePath)
    const sha = await sha256File(filePath)
    const rel = relativeToPermDir(legacyPermDir, filePath)

    const existing = await ledgerFind({
      stationId,
      sha256: sha,
      bytes: meta.bytes,
      relative_path: rel || '',
    })
    if (existing) {
      await markSkippedAndMove({
        ctx,
        stationId,
        sourcePath: filePath,
        relativePath: rel || '',
        fileName: path.basename(filePath),
        fileSize: meta.bytes,
        fileMtime: meta.mtime ?? new Date(meta.mtimeMs),
        sha256: sha,
      })
      opts.onMoved()
      return
    }

    const buf: Buffer = (await fs.readFile(filePath)) as Buffer
    await upsertSecureArtifact({
      stationId,
      artifactType: 'cert',
      artifactKey,
      payload: buf,
      metadataJson: { legacyPath: rel, importedAt: new Date().toISOString() },
    })

    const moved = await moveAside({
      moveRoot: ctx.moveAsideRoot,
      runId: ctx.runId,
      status: 'imported',
      relativePath: rel || '',
      from: filePath,
    })

    await ledgerUpsert({
      stationId,
      sourceType: ctx.sourceType,
      sourcePath: filePath,
      relativePath: rel,
      fileName: path.basename(filePath),
      fileSize: meta.bytes,
      fileMtime: meta.mtime ?? new Date(meta.mtimeMs),
      sha256: sha,
      status: 'imported',
      movedToPath: moved.movedTo,
    })

    opts.onInserted()
    opts.onMoved()
  }

  await importOne(pfxPath, LEGACY_EXTRA.CERT_PFX)
  await importOne(passPath, LEGACY_EXTRA.CERT_PASS)
}

export async function importFiscalDevice(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  onInserted: () => void
  onMoved: () => void
  onWarn: (w: string) => void
}) {
  const fp = path.join(opts.legacyPermDir, LEGACY_EXTRA.FISCAL_DEVICE)
  if (!(await fileHasContent(fp))) return

  await importSingleJsonFile({
    ctx: opts.ctx,
    stationId: opts.stationId,
    legacyPermDir: opts.legacyPermDir,
    fileName: LEGACY_EXTRA.FISCAL_DEVICE,
    kind: 'legacy_fiscal_device',
    onInserted: opts.onInserted,
    onMoved: opts.onMoved,
    onWarn: opts.onWarn,
    handler: async (json) => {
      await kvSet(opts.stationId, 'legacy.fiscal.device', json)
    },
  })
}

export async function importPrinterQueues(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  onInserted: (k: string) => void
  onMoved: () => void
  onWarn: (w: string) => void
}) {
  const importQueue = async (
    fileName: string,
    jobType: 'print.receipt' | 'print.report',
    insertedKey: string,
  ) => {
    const fp = path.join(opts.legacyPermDir, fileName)
    if (!(await fileHasContent(fp))) return

    await importSingleJsonFile({
      ctx: opts.ctx,
      stationId: opts.stationId,
      legacyPermDir: opts.legacyPermDir,
      fileName,
      kind: `legacy_${fileName}`,
      onInserted: () => opts.onInserted(insertedKey),
      onMoved: opts.onMoved,
      onWarn: opts.onWarn,
      handler: async (json) => {
        const items = Array.isArray(json) ? json : (json?.items ?? [])
        if (!Array.isArray(items)) return

        for (let i = 0; i < items.length; i++) {
          await enqueuePrintJob(opts.stationId, jobType, items[i], 0, {
            idempotencyKey: `${fileName}#${i}`,
          })
        }
      },
    })
  }

  await importQueue(
    LEGACY_EXTRA.PRINTER_TRANSACTION_QUEUE,
    'print.receipt',
    'printer_transaction_queue',
  )
  await importQueue(
    LEGACY_EXTRA.PRINTER_REPORT_QUEUE,
    'print.report',
    'printer_report_queue',
  )
}

export async function importRemoteUploadState(opts: {
  ctx: ImportContext
  stationId: string
  legacyPermDir: string
  onInserted: (k: string) => void
  onMoved: () => void
  onWarn: (w: string) => void
}) {
  const importState = async (
    fileName: string,
    kvKey: string,
    insertedKey: string,
  ) => {
    const fp = path.join(opts.legacyPermDir, fileName)
    if (!(await fileHasContent(fp))) return

    await importSingleJsonFile({
      ctx: opts.ctx,
      stationId: opts.stationId,
      legacyPermDir: opts.legacyPermDir,
      fileName,
      kind: `legacy_${fileName}`,
      onInserted: () => opts.onInserted(insertedKey),
      onMoved: opts.onMoved,
      onWarn: opts.onWarn,
      handler: async (json) => {
        await kvSet(opts.stationId, kvKey, json)
      },
    })
  }

  await importState(
    LEGACY_EXTRA.REMOTE_UPLOAD_QUEUE,
    'legacy.remoteUpload.queue',
    'remote_upload_queue',
  )
  await importState(
    LEGACY_EXTRA.REMOTE_UPLOAD_STATUS,
    'legacy.remoteUpload.status',
    'remote_upload_status',
  )
}
