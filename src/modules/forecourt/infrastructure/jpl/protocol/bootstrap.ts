import * as DomsPosJpl from '@gilbarcoafs/doms-pos-jpl'
import type { ForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

import { buildJplTlsClientOptions } from '@/src/modules/forecourt/infrastructure/jpl/tlsConfig'

export const DEFAULT_JPL_REQUIRED_FLAGS = [
  'UNSO_INSTSTA_1',
  'UNSO_TRBUFSTA_3',
  'UNSO_TGSTA_1',
  'UNSO_DELIVSTA_1',
  'UNSO_PRISTA_1',
] as const

export const DEFAULT_JPL_MFDR_FLAGS = ['UNSO_FPSTA_3'] as const

export const CONSERVATIVE_JPL_REQUIRED_FLAGS = [
  'UNSO_TRBUFSTA_3',
  'UNSO_INSTSTA_1',
] as const

export type BuildJplAccessCodeOptions = {
  baseAccessCode?: string
  drSeconds?: number
  ensureRi?: boolean
  requiredFlags?: readonly string[]
  mfdrFlags?: readonly string[]
}

const buildFcAccessCode = (DomsPosJpl as any).buildFcAccessCode as
  | ((input: {
      password?: string
      rejectInfo?: boolean
      flags?: Array<string | { flag: string; mfdr?: string | number }>
    }) => string)
  | undefined

const buildMfdrUnsolFlag = (DomsPosJpl as any).buildMfdrUnsolFlag as
  | ((flag: string, mfdr?: string | number) => string)
  | undefined

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

const tokenMatches = (candidate: string, token: string) => {
  const left = candidate.toUpperCase()
  const right = token.toUpperCase()
  return left === right || left.startsWith(`${right}:`)
}

const formatMfdrToken = (flag: string, drSeconds: number) => {
  if (buildMfdrUnsolFlag) return buildMfdrUnsolFlag(flag, drSeconds)
  return `${toCanonicalToken(flag)}:MFDR=${String(drSeconds).padStart(2, '0')}`
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
  const [passwordToken, ...flagTokens] = tokens.length > 0 ? tokens : ['POS']
  const effectivePassword = passwordToken || 'POS'
  const effectiveDr =
    Number.isFinite(Number(drSeconds)) && Number(drSeconds) > 0
      ? Math.trunc(Number(drSeconds))
      : 5

  const workingFlags = [...flagTokens]

  const upsertPlainToken = (token: string) => {
    const canonical = toCanonicalToken(token)
    if (!canonical) return
    if (workingFlags.some((candidate) => tokenMatches(candidate, canonical))) {
      return
    }
    workingFlags.push(canonical)
  }

  const upsertMfdrToken = (flag: string) => {
    const canonical = toCanonicalToken(flag)
    if (!canonical) return
    const mfdrToken = formatMfdrToken(canonical, effectiveDr)
    const existingIndex = workingFlags.findIndex((candidate) =>
      tokenMatches(candidate, canonical),
    )

    if (existingIndex >= 0) {
      workingFlags[existingIndex] = mfdrToken
      return
    }

    workingFlags.push(mfdrToken)
  }

  if (ensureRi) upsertPlainToken('RI')
  for (const flag of requiredFlags) upsertPlainToken(flag)
  for (const flag of mfdrFlags) upsertMfdrToken(flag)

  if (buildFcAccessCode) {
    return buildFcAccessCode({
      password: effectivePassword,
      rejectInfo: false,
      flags: workingFlags,
    })
  }

  return [effectivePassword, ...workingFlags].join(',')
}

const uniqueAccessCodes = (values: string[]) => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (!normalized) continue
    const key = normalized.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

const passwordOnlyAccessCode = (baseAccessCode: unknown) => {
  const [password] = tokenizeAccessCode(baseAccessCode)
  return password || 'POS'
}

export const buildJplAccessCodeFallbacks = (
  options: BuildJplAccessCodeOptions,
) => {
  const passwordOnly = passwordOnlyAccessCode(options.baseAccessCode)

  const primary = buildJplAccessCode(options)
  const conservative = buildJplAccessCode({
    baseAccessCode: passwordOnly,
    drSeconds: options.drSeconds,
    ensureRi: true,
    requiredFlags: CONSERVATIVE_JPL_REQUIRED_FLAGS,
    mfdrFlags:
      options.mfdrFlags && options.mfdrFlags.length > 0
        ? options.mfdrFlags
        : DEFAULT_JPL_MFDR_FLAGS,
  })
  const rejectInfoOnly = buildJplAccessCode({
    baseAccessCode: passwordOnly,
    ensureRi: true,
    requiredFlags: [],
    mfdrFlags: [],
  })
  const barePassword = buildJplAccessCode({
    baseAccessCode: passwordOnly,
    ensureRi: false,
    requiredFlags: [],
    mfdrFlags: [],
  })

  return uniqueAccessCodes([
    primary,
    conservative,
    rejectInfoOnly,
    barePassword,
  ])
}

export const isJplProtocolFamilyEnabled = (
  cfg: ForecourtRuntimeConfig,
  family: string,
) =>
  (cfg.jplOptionalProtocolFamilies ?? [])
    .map((entry) => String(entry).trim().toLowerCase())
    .includes(family.trim().toLowerCase())

export const buildJplBootstrapConfig = (cfg: ForecourtRuntimeConfig) => {
  const posId = normalizeJplPosId(cfg.jplPosId, '01')
  const accessCodeOptions: BuildJplAccessCodeOptions = {
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
  }
  const accessCode = buildJplAccessCode(accessCodeOptions)
  const accessCodeFallbacks = buildJplAccessCodeFallbacks(accessCodeOptions)
  const heartbeatIdleMs = Math.max(
    5_000,
    Number(cfg.jplHeartbeatIntervalMs || 15_000),
  )
  const inboundSilenceMs = Math.max(
    heartbeatIdleMs + 5_000,
    Number(cfg.jplDeadConnectionTimeoutMs || 30_000),
  )
  const requestedStatusUpdateCode = Number(cfg.jplStatusUpdateCode ?? 3)
  const hasUnsolicitedSubscriptions =
    (cfg.jplUnsolicitedFlags?.length ?? 0) > 0 ||
    (cfg.jplUnsolicitedMfdrFlags?.length ?? 0) > 0
  const statusUpdateCode =
    hasUnsolicitedSubscriptions &&
    (!Number.isFinite(requestedStatusUpdateCode) ||
      requestedStatusUpdateCode <= 0)
      ? 3
      : requestedStatusUpdateCode

  const tls = buildJplTlsClientOptions(cfg)

  return {
    posId,
    secureMode: Boolean(cfg.jplTlsRequired) || Number(cfg.jplPort) === 8889,
    tlsRequired: Boolean(cfg.jplTlsRequired),
    integrationScope: cfg.jplIntegrationScope,
    optionalProtocolFamilies: [...(cfg.jplOptionalProtocolFamilies ?? [])],
    accessCode,
    accessCodeFallbacks,
    countryCode: String(cfg.jplCountryCode ?? '').trim() || '1',
    posVersionId: String(cfg.jplPosVersionId ?? '').trim() || '470-02-1.08',
    statusUpdateCode,
    bootstrapSnapshotEnabled: Boolean(cfg.jplBootstrapSnapshotEnabled ?? true),
    clientOptions: {
      host: cfg.jplHost,
      port: cfg.jplPort,
      strictProtocolValidation: true,
      heartbeatIdleMs,
      inboundSilenceMs,
      ...(tls ? { tls } : {}),
    },
    logonOptions: {
      accessCode,
      countryCode: String(cfg.jplCountryCode ?? '').trim() || '1',
      posVersionId: String(cfg.jplPosVersionId ?? '').trim() || '470-02-1.08',
      includeDefaultUnsolFlags: false,
    },
    features: {
      wetstock: true,
      ept: false,
      wash: isJplProtocolFamilyEnabled(cfg, 'wash'),
      vending: isJplProtocolFamilyEnabled(cfg, 'vending'),
    },
  }
}
