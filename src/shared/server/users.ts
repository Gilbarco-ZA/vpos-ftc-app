import { queryAll, queryOne } from '@/src/platform/db/postgres'

const USER_LIST_COLS = `id, station_id, username, email, role, full_name, is_active, last_login_at, created_at, updated_at`

export async function listUsers(stationId: string) {
  return queryAll<any>(
    `SELECT ${USER_LIST_COLS}
     FROM users
     WHERE station_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [stationId],
  )
}

export async function getUserById(id: string, stationId: string) {
  return queryOne<any>(
    `SELECT ${USER_LIST_COLS}
     FROM users
     WHERE id = $1 AND station_id = $2 AND deleted_at IS NULL`,
    [id, stationId],
  )
}

export async function userExists(id: string, stationId: string) {
  return queryOne<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND station_id = $2 AND deleted_at IS NULL`,
    [id, stationId],
  )
}

export async function getUserDisplayName(
  userId?: string | null,
): Promise<string | null> {
  if (!userId) return null
  const row = await queryOne<{
    full_name?: string | null
    username?: string | null
  }>(`SELECT full_name, username FROM users WHERE id = $1`, [userId])
  return row?.full_name || row?.username || null
}

export async function countActiveUsers() {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(1) AS count FROM users WHERE deleted_at IS NULL`,
  )
  return Number(row?.count || 0)
}
