import type { ForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

export const DEFAULT_JPL_REQUIRED_FLAGS = [
  'UNSO_TRBUFSTA_3',
  'UNSO_TGSTA_1',
  'UNSO_DELIVSTA_1',
] as const

export const DEFAULT_JPL_MFDR_FLAGS = ['UNSO_FPSTA_3'] as const

export type BuildJplAccessCodeOptions = {
  baseAccessCode?: string
  drSeconds?: number
  ensureRi?: boolean
  requiredFlags?: readonly string[]
  mfdrFlags?: readonly string[]
}

const toCanonicalToken = (value: unknown) => String(value ?? '').trim()

export const tokenizeAccessCode = (value: unknown): string[] =>
  String(value ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)

export const isReservedJplPosId = (value: unknown) => {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) && Math.trunc(n) === 0
}

export const normalizeJplPosId = (
  value: unknown,
  fallback = '01',
  options: { allowZero?: boolean } = {},
) => {
  const allowZero = Boolean(options.allowZero)
  const raw = String(value ?? '').trim()
  const fallbackRaw = String(fallback ?? '01').trim() || '01'
  const chosen = raw || fallbackRaw

  if (!/^\d{1,2}$/.test(chosen)) {
    throw new Error('JPL POS ID must be a 1-2 digit numeric string')
  }

  const numeric = Math.trunc(Number(chosen))
  if (!Number.isFinite(numeric)) {
    throw new Error('JPL POS ID must be numeric')
  }
  if (!allowZero && numeric === 0) {
    throw new Error(
      'JPL POS ID 00 is reserved and cannot be used by a POS client',
    )
  }
  if (numeric < 0 || numeric > 89) {
    throw new Error('JPL POS ID must be between 01 and 89 for real POS clients')
  }

  return String(numeric).padStart(2, '0')
}

export const buildJplAccessCode = (options: BuildJplAccessCodeOptions) => {
  const {
    baseAccessCode,
    drSeconds = 5,
    ensureRi = true,
    requiredFlags = DEFAULT_JPL_REQUIRED_FLAGS,
    mfdrFlags = DEFAULT_JPL_MFDR_FLAGS,
  } = options

  const tokens = tokenizeAccessCode(baseAccessCode)
  const effectiveDr =
    Number.isFinite(Number(drSeconds)) && Number(drSeconds) > 0
      ? Math.trunc(Number(drSeconds))
      : 5

  const hasToken = (token: string) =>
    tokens.some((candidate) => candidate.toUpperCase() === token.toUpperCase())

  const findTokenIndex = (prefix: string) =>
    tokens.findIndex((candidate) =>
      candidate.toUpperCase().startsWith(prefix.toUpperCase()),
    )

  const upsertPlainToken = (token: string) => {
    const canonical = toCanonicalToken(token)
    if (!canonical) return
    if (!hasToken(canonical)) tokens.push(canonical)
  }

  const upsertMfdrToken = (prefix: string) => {
    const canonical = toCanonicalToken(prefix)
    if (!canonical) return
    const index = findTokenIndex(canonical)
    if (index < 0) {
      tokens.push(`${canonical}:MFDR=${effectiveDr}`)
      return
    }

    const existing = tokens[index]
    if (/MFDR=/i.test(existing)) return
    tokens[index] = `${existing}:MFDR=${effectiveDr}`
  }

  if (ensureRi) upsertPlainToken('RI')
  for (const flag of requiredFlags) upsertPlainToken(flag)
  for (const flag of mfdrFlags) upsertMfdrToken(flag)

  return tokens.join(',')
}

export const buildJplBootstrapConfig = (cfg: ForecourtRuntimeConfig) => {
  const posId = normalizeJplPosId(cfg.jplPosId, '01')
  const accessCode = buildJplAccessCode({
    baseAccessCode: cfg.jplAccessCode,
    drSeconds: cfg.jplUnsolicitedDrSeconds,
    requiredFlags:
      cfg.jplUnsolicitedFlags?.length > 0
        ? cfg.jplUnsolicitedFlags
        : DEFAULT_JPL_REQUIRED_FLAGS,
    mfdrFlags:
      cfg.jplUnsolicitedMfdrFlags?.length > 0
        ? cfg.jplUnsolicitedMfdrFlags
        : DEFAULT_JPL_MFDR_FLAGS,
  })

  return {
    posId,
    secureMode: Number(cfg.jplPort) === 8889,
    accessCode,
    countryCode: String(cfg.jplCountryCode ?? '').trim() || '1',
    posVersionId: String(cfg.jplPosVersionId ?? '').trim() || '470-02-1.08',
    statusUpdateCode: Number(cfg.jplStatusUpdateCode ?? 3),
    bootstrapSnapshotEnabled: Boolean(cfg.jplBootstrapSnapshotEnabled ?? true),
    clientOptions: {
      host: cfg.jplHost,
      port: cfg.jplPort,
      strictProtocolValidation: true,
    },
    logonOptions: {
      accessCode,
      countryCode: String(cfg.jplCountryCode ?? '').trim() || '1',
      posVersionId: String(cfg.jplPosVersionId ?? '').trim() || '470-02-1.08',
      includeDefaultUnsolFlags: false,
    },
    features: {
      wetstock: true,
      ept: true,
      wash: true,
      vending: true,
    },
  }
}
