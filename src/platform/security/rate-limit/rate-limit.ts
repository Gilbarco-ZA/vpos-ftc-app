import { query, txQuery, withTransaction } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/ids'

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const MAX_LOGIN_ATTEMPTS = 5

export const checkRateLimit = async (
  key: string,
): Promise<{ allowed: boolean; remaining: number }> => {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + RATE_LIMIT_WINDOW_MS)

  const result = await withTransaction(async (client: any) => {
    const existing = await txQuery<Record<string, unknown>>(
      client,
      'SELECT id, count, window_end FROM rate_limits WHERE key = $1 FOR UPDATE',
      [key],
    )

    if (!existing.rows[0]) {
      await txQuery(
        client,
        `INSERT INTO rate_limits (id, key, count, window_start, window_end)
         VALUES ($1, $2, 1, $3, $4)`,
        [uuidv4(), key, now, windowEnd],
      )
      return 1
    }

    const row = existing.rows[0]
    const currentCount = row.count as number
    const currentWindowEnd = new Date(row.window_end as string)

    if (now > currentWindowEnd) {
      await txQuery(
        client,
        `UPDATE rate_limits
         SET count = 1, window_start = $2, window_end = $3
         WHERE key = $1`,
        [key, now, windowEnd],
      )
      return 1
    }

    const nextCount = currentCount + 1
    await txQuery(client, 'UPDATE rate_limits SET count = $1 WHERE key = $2', [
      nextCount,
      key,
    ])

    return nextCount
  })

  return {
    allowed: result <= MAX_LOGIN_ATTEMPTS,
    remaining: Math.max(0, MAX_LOGIN_ATTEMPTS - result),
  }
}

export const clearRateLimit = async (key: string): Promise<void> => {
  await query('DELETE FROM rate_limits WHERE key = $1', [key])
}
