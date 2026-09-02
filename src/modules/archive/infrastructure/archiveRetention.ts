import type { RuntimeArchivePolicy } from '@/src/modules/archive/domain/runtimeArchivePolicy'

import { txQuery, withTransaction } from '@/src/platform/db/postgres'
import { logger } from '@/src/shared/utils/logger'

const ARCHIVE_RETENTION_LOCK = 'retention:archive-events'

export type ArchiveRetentionResult = {
  locked: boolean
  deleted: number
  batches: number
  oldestRemaining: string | null
}

export async function pruneArchiveEvents(opts: {
  retentionDays: number
  batchSize: number
  maxBatches: number
}): Promise<ArchiveRetentionResult> {
  if (opts.retentionDays <= 0) {
    return {
      locked: false,
      deleted: 0,
      batches: 0,
      oldestRemaining: null,
    }
  }

  return await withTransaction(async (client) => {
    const lockResult = await txQuery<{ locked: boolean }>(
      client,
      `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked`,
      [ARCHIVE_RETENTION_LOCK],
    )
    const locked = Boolean(lockResult.rows[0]?.locked)
    if (!locked) {
      return {
        locked: false,
        deleted: 0,
        batches: 0,
        oldestRemaining: null,
      }
    }

    let deleted = 0
    let batches = 0

    for (let index = 0; index < opts.maxBatches; index += 1) {
      const result = await txQuery<{ id: string }>(
        client,
        `WITH candidates AS (
           SELECT id
             FROM archive_events
            WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
            ORDER BY created_at, id
            LIMIT $2
         )
         DELETE FROM archive_events AS archive
          USING candidates
          WHERE archive.id = candidates.id
         RETURNING archive.id`,
        [opts.retentionDays, opts.batchSize],
      )

      const removed = result.rowCount ?? result.rows.length
      deleted += removed
      batches += 1

      if (removed < opts.batchSize) break
    }

    const oldestResult = await txQuery<{
      oldest_remaining: Date | string | null
    }>(client, `SELECT MIN(created_at) AS oldest_remaining FROM archive_events`)
    const oldest = oldestResult.rows[0]?.oldest_remaining ?? null

    return {
      locked: true,
      deleted,
      batches,
      oldestRemaining:
        oldest instanceof Date
          ? oldest.toISOString()
          : (oldest?.toString() ?? null),
    }
  })
}

let retentionStarted = false
let retentionTimer: NodeJS.Timeout | null = null

export function startArchiveRetentionWorker(policy: RuntimeArchivePolicy) {
  if (retentionStarted) return
  retentionStarted = true

  if (policy.retentionDays <= 0) {
    logger.info('[archiveRetention]', {
      msg: 'Archive event retention disabled',
    })
    return
  }

  const run = async () => {
    const startedAt = Date.now()
    try {
      const result = await pruneArchiveEvents({
        retentionDays: policy.retentionDays,
        batchSize: policy.cleanupBatchSize,
        maxBatches: policy.cleanupMaxBatches,
      })
      logger.info('[archiveRetention]', {
        retentionDays: policy.retentionDays,
        deleted: result.deleted,
        batches: result.batches,
        locked: result.locked,
        oldestRemaining: result.oldestRemaining,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      logger.error('[archiveRetention]', {
        msg: 'Archive event retention failed',
        error,
        durationMs: Date.now() - startedAt,
      })
    }
  }

  void run()
  retentionTimer = setInterval(() => void run(), policy.cleanupIntervalMs)
  retentionTimer.unref?.()
}
