import { getClient } from '@/src/platform/db/postgres'

export type AtgPollingWorkerLock = {
  release: () => Promise<void>
}

export async function acquireAtgPollingWorkerLock(
  stationId: string,
): Promise<AtgPollingWorkerLock | null> {
  const client = await getClient()
  const lockKey = `worker:atgPollingWorker:${stationId}`

  try {
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [lockKey],
    )
    if (!result.rows[0]?.locked) {
      client.release()
      return null
    }

    let released = false
    return {
      release: async () => {
        if (released) return
        released = true
        try {
          await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
            lockKey,
          ])
        } finally {
          client.release()
        }
      },
    }
  } catch (error) {
    client.release()
    throw error
  }
}
