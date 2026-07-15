import type {
  DomsJplLiveValidationOptions,
  DomsJplLiveValidationProfile,
  DomsJplLiveValidationReport,
} from '@/src/modules/forecourt/infrastructure/jpl/liveValidation'
import type { SessionUser } from '@/src/shared/types'

import { validateDomsJplLiveReadOnlyTarget } from '@/src/modules/forecourt/infrastructure/jpl/liveValidation'
import { loadForecourtRuntimeConfigFromDb } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

export type RunDomsLiveReadOnlyValidationInput = {
  host?: unknown
  port?: unknown
  secure?: unknown
  rejectUnauthorized?: unknown
  profile?: unknown
  timeoutMs?: unknown
  idleCollectMs?: unknown
  fcAccessCode?: unknown
  countryCode?: unknown
  posVersionId?: unknown
  includeRejectProbe?: unknown
  useConfiguredTarget?: unknown
}

export type RunDomsLiveReadOnlyValidationResult = {
  report: DomsJplLiveValidationReport
  evidenceImport: Record<string, unknown>
  canImportEvidence: true
  safetyBoundary: DomsJplLiveValidationReport['safetyBoundary']
}

const bool = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback

const optionalString = (value: unknown) => {
  if (value == null) return undefined
  const text = String(value).trim()
  return text || undefined
}

const optionalNumber = (value: unknown) => {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

const optionalProfile = (value: unknown) => {
  const text = optionalString(value)
  return text as DomsJplLiveValidationProfile | undefined
}

export async function runDomsLiveReadOnlyValidation(
  input: RunDomsLiveReadOnlyValidationInput,
  user: SessionUser,
): Promise<RunDomsLiveReadOnlyValidationResult> {
  const useConfiguredTarget = bool(input.useConfiguredTarget, true)
  const cfg = useConfiguredTarget
    ? await loadForecourtRuntimeConfigFromDb(user.stationId)
    : null

  const options: DomsJplLiveValidationOptions = {
    host: optionalString(input.host) ?? cfg?.jplHost,
    port: optionalNumber(input.port) ?? cfg?.jplPort,
    secure: input.secure != null ? bool(input.secure) : cfg?.jplTlsRequired,
    rejectUnauthorized: bool(input.rejectUnauthorized),
    profile: optionalProfile(input.profile) ?? 'minimal-readonly',
    timeoutMs: optionalNumber(input.timeoutMs),
    idleCollectMs: optionalNumber(input.idleCollectMs),
    fcAccessCode: optionalString(input.fcAccessCode) ?? cfg?.jplAccessCode,
    countryCode: optionalString(input.countryCode) ?? cfg?.jplCountryCode,
    posVersionId: optionalString(input.posVersionId) ?? cfg?.jplPosVersionId,
    includeRejectProbe: bool(input.includeRejectProbe),
  }

  const report = await validateDomsJplLiveReadOnlyTarget(options)

  return {
    report,
    evidenceImport: report.fieldValidationEvidenceImport,
    canImportEvidence: true,
    safetyBoundary: report.safetyBoundary,
  }
}
