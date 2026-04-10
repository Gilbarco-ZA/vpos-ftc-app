import { query, queryAll } from '@/src/platform/db/postgres/core'

/**
 * Platform-owned Postgres advisory locks.
 * Shared DB exposes a validated facade for cross-cutting callers.
 */
export async function tryAdvisoryLock(key: string): Promise<boolean> {
  const r = await queryAll<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock(hashtext($1)) as locked`,
    [key],
  )
  return !!r?.[0]?.locked
}

export async function advisoryUnlock(key: string): Promise<void> {
  await query(`SELECT pg_advisory_unlock(hashtext($1))`, [key])
}
