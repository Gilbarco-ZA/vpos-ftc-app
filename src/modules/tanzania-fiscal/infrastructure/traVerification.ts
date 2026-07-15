import { readTanzaniaFiscalConfig } from './config'
import { resolveTraTokenEndpoint } from './traAuth'

export const TRA_VERIFICATION_URL_PROD = 'https://verify.tra.go.tz/'
export const TRA_VERIFICATION_URL_TEST =
  'https://virtual.tra.go.tz/efdmsRctVerify/'

export type TraVerificationUrlOptions = {
  baseUrl?: string | null
  production?: boolean | null
}

export type TraEndpointCheck = {
  ok: boolean
  endpoint: string
  checkedAt: Date
  httpStatus: number | null
  error: string | null
}

export type TraVfdStatus = {
  internet: boolean
  tra: boolean
  lastInternetConnection?: Date
  lastTraConnection?: Date
  checks: {
    internet: TraEndpointCheck
    tra: TraEndpointCheck
  }
}

export type TraVfdStatusOptions = {
  baseUrl?: string | null
  internetCheckUrl?: string | null
  now?: Date
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const DEFAULT_INTERNET_CHECK_URL = 'https://vpos.site'
const DEFAULT_TRA_STATUS_ENDPOINT = 'https://vfd.tra.go.tz/vfdtoken'
const TRA_STATUS: Pick<
  TraVfdStatus,
  'internet' | 'tra' | 'lastInternetConnection' | 'lastTraConnection'
> = {
  internet: false,
  tra: false,
}

function urlJoin(base: string, path: string) {
  const cleanBase = String(base || '')
    .trim()
    .replace(/\/+$/, '')
  const cleanPath = String(path || '')
    .trim()
    .replace(/^\/+/, '')
  return `${cleanBase}/${cleanPath}`
}

function normalizeUrlRoot(value: string) {
  const clean = String(value || '').trim()
  return clean.endsWith('/') ? clean : `${clean}/`
}

function endpointLooksNonProduction(value: string) {
  return /(?:test|virtual|sandbox|staging|dev)/i.test(String(value || ''))
}

function isProductionVerificationEndpoint(opts: TraVerificationUrlOptions) {
  if (opts.production != null) return opts.production
  if (!opts.baseUrl) return true
  return !endpointLooksNonProduction(opts.baseUrl)
}

/**
 * Builds the TRA receipt verification code used in the package QR/receipt output.
 *
 * Reference behavior: RCTVNUM alone when no time is available, otherwise
 * RCTVNUM_HHMMSS with the colon separators removed from the receipt time.
 */
export function getTraVerificationCode(
  rctvnum: string,
  receiptTime?: string | null,
) {
  const receiptVerificationNo = String(rctvnum ?? '').trim()
  const cleanReceiptTime = String(receiptTime ?? '').trim()
  if (!cleanReceiptTime) return receiptVerificationNo
  return `${receiptVerificationNo}_${cleanReceiptTime.replace(/:/g, '')}`
}

export function resolveTraVerificationBaseUrl(
  opts: TraVerificationUrlOptions = {},
) {
  return normalizeUrlRoot(
    isProductionVerificationEndpoint(opts)
      ? TRA_VERIFICATION_URL_PROD
      : TRA_VERIFICATION_URL_TEST,
  )
}

export function getTraVerificationUrl(
  rctvnum: string,
  receiptTime?: string | null,
  opts: TraVerificationUrlOptions = {},
) {
  return urlJoin(
    resolveTraVerificationBaseUrl(opts),
    getTraVerificationCode(rctvnum, receiptTime),
  )
}

export function resolveTraAvailabilityEndpoint(baseUrl?: string | null) {
  const clean = String(baseUrl ?? '').trim()
  if (!clean) return DEFAULT_TRA_STATUS_ENDPOINT
  return resolveTraTokenEndpoint(clean)
}

async function checkHttpEndpoint(args: {
  endpoint: string
  now: Date
  timeoutMs: number
  fetchImpl: typeof fetch
}): Promise<TraEndpointCheck> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs)

  try {
    const response = await args.fetchImpl(args.endpoint, {
      method: 'GET',
      signal: controller.signal,
    })
    await response.body?.cancel().catch(() => undefined)

    return {
      ok: response.status > 0,
      endpoint: args.endpoint,
      checkedAt: args.now,
      httpStatus: response.status,
      error: null,
    }
  } catch (e: any) {
    return {
      ok: false,
      endpoint: args.endpoint,
      checkedAt: args.now,
      httpStatus: null,
      error: String(e?.message || e),
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * FTC-native replacement for vpos-fiscal-tz's TRA VFD status overview.
 *
 * The reference package checks generic internet reachability and TRA endpoint
 * reachability, preserving the last successful timestamps in module memory.
 * FTC keeps the same runtime semantics while allowing tests/admin diagnostics
 * to inject endpoint URLs and fetch implementations.
 */
export async function traVfdStatusOverview(
  opts: TraVfdStatusOptions = {},
): Promise<TraVfdStatus> {
  const now = opts.now ?? new Date()
  const timeoutMs = Number.isFinite(Number(opts.timeoutMs))
    ? Number(opts.timeoutMs)
    : 1000
  const fetchImpl = opts.fetchImpl ?? fetch
  const internetEndpoint = String(
    opts.internetCheckUrl || DEFAULT_INTERNET_CHECK_URL,
  ).trim()
  const traEndpoint = resolveTraAvailabilityEndpoint(opts.baseUrl)

  const internet = await checkHttpEndpoint({
    endpoint: internetEndpoint,
    now,
    timeoutMs,
    fetchImpl,
  })
  const tra = await checkHttpEndpoint({
    endpoint: traEndpoint,
    now,
    timeoutMs,
    fetchImpl,
  })

  TRA_STATUS.internet = internet.ok
  TRA_STATUS.tra = tra.ok
  if (internet.ok) TRA_STATUS.lastInternetConnection = now
  if (tra.ok) TRA_STATUS.lastTraConnection = now

  return {
    internet: TRA_STATUS.internet,
    tra: TRA_STATUS.tra,
    lastInternetConnection: TRA_STATUS.lastInternetConnection,
    lastTraConnection: TRA_STATUS.lastTraConnection,
    checks: { internet, tra },
  }
}

export async function traVfdStatusOverviewFromConfig(args: {
  stationId: string
  internetCheckUrl?: string | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
}) {
  const cfg = await readTanzaniaFiscalConfig(args.stationId)
  return await traVfdStatusOverview({
    baseUrl: cfg.tra.baseUrl,
    internetCheckUrl: args.internetCheckUrl,
    timeoutMs: args.timeoutMs,
    fetchImpl: args.fetchImpl,
  })
}

export function resetTraVfdStatusForTests() {
  TRA_STATUS.internet = false
  TRA_STATUS.tra = false
  delete TRA_STATUS.lastInternetConnection
  delete TRA_STATUS.lastTraConnection
}
