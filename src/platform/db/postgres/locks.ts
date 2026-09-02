import type { PoolClient } from 'pg'

import { getPool } from '@/src/platform/db/postgres/core'
import { logger } from '@/src/shared/utils/logger'
import { serializeError } from '@/src/shared/utils/serializeError'

type AdvisoryLockGlobals = typeof globalThis & {
  __vposPostgresAdvisoryLockClients?: Map<string, PoolClient>
}

const lockGlobals = () => globalThis as AdvisoryLockGlobals

const getHeldLocks = () => {
  const globals = lockGlobals()
  if (!globals.__vposPostgresAdvisoryLockClients) {
    globals.__vposPostgresAdvisoryLockClients = new Map()
  }
  return globals.__vposPostgresAdvisoryLockClients
}

/**
 * PostgreSQL session advisory locks must be unlocked on the same connection
 * that acquired them. Keep the checked-out PoolClient for the short lifetime
 * of each worker loop instead of acquiring/unlocking through arbitrary pool
 * sessions.
 */
export async function tryAdvisoryLock(key: string): Promise<boolean> {
  const heldLocks = getHeldLocks()
  if (heldLocks.has(key)) return false

  const client = await getPool().connect()
  try {
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [key],
    )
    const locked = Boolean(result.rows[0]?.locked)
    if (!locked) {
      client.release()
      return false
    }

    heldLocks.set(key, client)
    return true
  } catch (error) {
    client.release()
    throw error
  }
}

export async function advisoryUnlock(key: string): Promise<void> {
  const heldLocks = getHeldLocks()
  const client = heldLocks.get(key)
  if (!client) return

  heldLocks.delete(key)
  try {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key])
  } catch (error) {
    logger.error('[postgres]', {
      msg: 'failed to release advisory lock on owning session',
      key,
      error: serializeError(error),
    })
  } finally {
    client.release()
  }
}
