import { query } from '@/src/platform/db/postgres'

export async function softDeleteUser(userId: string) {
  await query(
    'UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1',
    [userId],
  )
}

export async function updateUserMetadata(input: {
  stationId: string
  userId: string
  role?: string
  fullName?: string
  email?: string
  username?: string
}) {
  await query(
    `
      UPDATE users
      SET role = COALESCE($1, role),
          full_name = COALESCE($2, full_name),
          email = COALESCE($3, email),
          username = COALESCE($4, username),
          updated_at = NOW()
      WHERE id = $5 AND station_id = $6 AND deleted_at IS NULL
    `,
    [
      input.role ?? null,
      input.fullName ?? null,
      input.email ?? null,
      input.username ?? null,
      input.userId,
      input.stationId,
    ],
  )
}
