import type { SessionUser, UserRole } from '@/src/shared/types'

import { query, queryOne } from '@/src/platform/db/postgres'
import { AuthError, requireAuth } from '@/src/shared/auth'
import { listSetupCountryOptions } from '@/src/shared/server/config/countryDatasets'
import { getSetupFlags } from '@/src/shared/setup/storage'
import { normalizeStringArray } from '@/src/shared/utils/inputs'
import { uuidv4 } from '@/src/shared/utils/uuid'

const ALLOWED_SETUP_ROLES = new Set<UserRole>([
  'tenant',
  'manager',
  'administrator',
])

export async function getOrCreateDefaultStationId(): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id
       FROM fuel_stations
      WHERE is_active = TRUE AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1`,
  )
  if (existing?.id) return existing.id

  const id = uuidv4()
  const code = `STATION-${Date.now()}`
  const countries = await listSetupCountryOptions()
  const rawCountry = String(
    process.env.COUNTRY_CODE ||
      countries[0]?.countryCode ||
      countries[0]?.value ||
      '',
  )
    .trim()
    .toUpperCase()
  const country =
    countries.find(
      (item) => item.value === rawCountry || item.countryCode === rawCountry,
    )?.value ||
    countries[0]?.value ||
    rawCountry ||
    'UN'

  await query(
    `INSERT INTO fuel_stations (id, code, name, country, is_active)
     VALUES ($1, $2, $3, $4, TRUE)`,
    [id, code, 'Default Station', country],
  )

  return id
}

function normalizeRolesWhenConfigured(value: unknown): UserRole[] {
  const roles = normalizeStringArray(value).filter((role): role is UserRole =>
    ALLOWED_SETUP_ROLES.has(role as UserRole),
  )
  return roles.length ? roles : ['administrator', 'manager']
}

export async function resolveSetupContext(options?: {
  rolesWhenConfigured?: UserRole[]
}): Promise<{
  stationId: string
  user: SessionUser | null
  isPublicSetup: boolean
}> {
  const rolesWhenConfigured = normalizeRolesWhenConfigured(
    options?.rolesWhenConfigured,
  )
  try {
    const user = await requireAuth(rolesWhenConfigured)
    return { stationId: user.stationId, user, isPublicSetup: false }
  } catch (err: any) {
    if (!(err instanceof AuthError)) throw err

    const stationId = await getOrCreateDefaultStationId()
    const flags = await getSetupFlags(stationId)
    if (flags.success) {
      throw new AuthError('Unauthorized', err.statusCode || 401)
    }

    return { stationId, user: null, isPublicSetup: true }
  }
}
