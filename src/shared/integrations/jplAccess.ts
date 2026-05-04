import type { PosBackend } from '@/src/shared/integrations/posBackend'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export type JplAccessMode = 'pos' | 'forecourt'

type JplAccessDeps = {
  assertPosBackendAllowed: (
    stationId: string,
    allowed: PosBackend[] | PosBackend,
  ) => Promise<PosBackend>
  getJplConfig: (stationId: string) => Promise<{ host?: string | null } | null>
}

async function resolveJplAccessDeps(
  deps?: JplAccessDeps,
): Promise<JplAccessDeps> {
  if (deps) return deps

  const [{ assertPosBackendAllowed }, { getJplConfig }] = await Promise.all([
    import('@/src/shared/integrations/posBackend'),
    import('@/src/platform/integrations/jpl/config'),
  ])

  return {
    assertPosBackendAllowed,
    getJplConfig,
  }
}

export async function assertJplAccessAllowed(
  stationId: string,
  accessMode: JplAccessMode = 'pos',
  deps?: JplAccessDeps,
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const resolvedDeps = await resolveJplAccessDeps(deps)

  if (accessMode === 'forecourt') {
    const cfg = await resolvedDeps.getJplConfig(normalizedStationId)
    if (!cfg?.host) {
      throw Object.assign(new Error('JPL is not configured'), {
        code: 'JPL_NOT_CONFIGURED',
        status: 409,
      })
    }
    return 'jpl' as const
  }

  return await resolvedDeps.assertPosBackendAllowed(normalizedStationId, [
    'jpl',
  ])
}
