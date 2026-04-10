import fs from 'fs/promises'
import path from 'path'
import type { SessionUser } from '@/src/shared/types'

import { queryOne } from '@/src/platform/db/postgres'
import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LEGACY_PERM_DIR =
  process.env.LEGACY_PERM_DIR || '/opt/fccapps/vpos-perm/vposfiscal'

async function pathExists(p: string) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function hasLegacyWork(permDir: string) {
  // Keep this intentionally cheap: any non-empty json file in known places
  const candidates = [
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

  for (const c of candidates) {
    const p = path.join(permDir, c)
    if (!(await pathExists(p))) continue
    const st = await fs.stat(p)
    if (st.isDirectory()) {
      const entries = await fs.readdir(p, { withFileTypes: true })
      if (entries.some((e) => e.isFile() && e.name.endsWith('.json')))
        return true
    } else if (st.isFile() && st.size > 5) return true
  }
  return false
}

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])

    const hasWork = await hasLegacyWork(LEGACY_PERM_DIR)

    const last = await queryOne<any>(
      `
      SELECT status, updated_at
      FROM legacy_import_ledger
      WHERE station_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [user?.stationId],
    )

    const counts = await queryOne<any>(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'imported')::int AS imported,
        COUNT(*) FILTER (WHERE status = 'skipped')::int  AS skipped,
        COUNT(*) FILTER (WHERE status = 'failed')::int   AS failed
      FROM legacy_import_ledger
      WHERE station_id = $1
      `,
      [user?.stationId],
    )

    return ok({ hasWork, last, counts })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
