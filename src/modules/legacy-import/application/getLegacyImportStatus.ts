import fs from 'node:fs/promises'
import path from 'node:path'

import { queryOne } from '@/src/platform/db/postgres'

const DEFAULT_LEGACY_PERM_DIR = '/opt/fccapps/vpos-perm/vposfiscal'
const LEGACY_CANDIDATES = [
  'transactions',
  'pending-transactions',
  'reports',
  'ewura-transactions',
  'ewura-reports',
  'fiscal.transaction.queue.json',
  'fiscal.report.queue.json',
  'ewura.config.json',
  'ewura.registration.json',
  'ewura.reports.json',
  'ewura.transactions.json',
]

async function pathExists(candidate: string) {
  try {
    await fs.access(/*turbopackIgnore: true*/ candidate)
    return true
  } catch {
    return false
  }
}

async function hasLegacyWork(permDir: string) {
  for (const name of LEGACY_CANDIDATES) {
    const candidate = path.join(/*turbopackIgnore: true*/ permDir, name)
    if (!(await pathExists(candidate))) continue
    const stats = await fs.stat(/*turbopackIgnore: true*/ candidate)
    if (stats.isDirectory()) {
      const entries = await fs.readdir(/*turbopackIgnore: true*/ candidate, {
        withFileTypes: true,
      })
      if (
        entries.some(
          (entry: { isFile(): boolean; name: string }) =>
            entry.isFile() && entry.name.endsWith('.json'),
        )
      ) {
        return true
      }
    } else if (stats.isFile() && stats.size > 5) {
      return true
    }
  }
  return false
}

export async function getLegacyImportStatus(stationId: string) {
  const permDir = process.env.LEGACY_PERM_DIR || DEFAULT_LEGACY_PERM_DIR
  const [hasWork, last, counts] = await Promise.all([
    hasLegacyWork(permDir),
    queryOne<Record<string, unknown>>(
      `
        SELECT status, updated_at
        FROM legacy_import_ledger
        WHERE station_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [stationId],
    ),
    queryOne<Record<string, unknown>>(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'imported')::int AS imported,
          COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM legacy_import_ledger
        WHERE station_id = $1
      `,
      [stationId],
    ),
  ])
  return { hasWork, last, counts }
}
