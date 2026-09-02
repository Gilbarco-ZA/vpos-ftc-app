import { bootstrapStationConfig } from '@/src/platform/config/loader'
import { queryOne } from '@/src/platform/db/postgres'
import { createUser } from '@/src/shared/auth'

import { getOrCreateSetupStationId } from './context'

export async function createInitialAdmin(input: {
  username: string
  email: string
  password: string
  fullName?: string
}) {
  const stationId = await getOrCreateSetupStationId()
  const existingUser = await queryOne<{ id: string }>(
    `SELECT id FROM users
      WHERE station_id = $1
        AND (username = $2 OR email = $3)
        AND deleted_at IS NULL
      LIMIT 1`,
    [stationId, input.username, input.email],
  )
  if (existingUser?.id) return { created: false as const }

  const user = await createUser({
    stationId,
    username: input.username,
    email: input.email,
    password: input.password,
    role: 'administrator',
    fullName: input.fullName,
  })
  await bootstrapStationConfig(stationId)
  return { created: true as const, user }
}
