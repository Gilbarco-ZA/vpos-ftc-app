type TraTokenCacheEntry = {
  token: string
  expiresAtMs: number
  payload: TraTokenPayload
}

export type TraTokenCredentials = {
  stationId: string
  baseUrl: string
  username: string | null
  password: string | null
  forceRefresh?: boolean
  fetchImpl?: typeof fetch
}

export type TraTokenPayload = {
  access_token?: string
  token_type?: string
  expires_in?: string | number
  ackcode?: string
  ackmsg?: string
  [key: string]: unknown
}

export type TraTokenRequestAudit = {
  endpoint: string
  headers: Record<string, string>
  body: {
    username: string
    password: string
    grant_type: 'password'
  }
}

export type TraTokenResult = {
  ok: boolean
  token: string | null
  endpoint: string | null
  fromCache: boolean
  skipped: boolean
  request: TraTokenRequestAudit | null
  response: {
    httpStatus: number | null
    ackcode: string | null
    ackmsg: string | null
    payload: TraTokenPayload | null
    raw: string | null
  }
  error: string | null
}

const DEFAULT_TOKEN_TTL_SECONDS = 15 * 60
const TOKEN_EXPIRY_SKEW_MS = 30 * 1000
const tokenCache = new Map<string, TraTokenCacheEntry>()

function urlJoin(base: string, path: string) {
  const cleanBase = String(base || '')
    .trim()
    .replace(/\/+$/, '')
  const cleanPath = String(path || '')
    .trim()
    .replace(/^\/+/, '')
  return `${cleanBase}/${cleanPath}`
}

export function resolveTraTokenEndpoint(baseUrl: string) {
  const clean = String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
  if (/vfdtoken/i.test(clean)) return clean
  if (/\/api\/efdmsrctinfo/i.test(clean)) {
    return clean.replace(/\/api\/efdmsrctinfo/i, '/vfdtoken')
  }
  return urlJoin(clean, 'vfdtoken')
}

export function buildTraTokenRequestBody(args: {
  username: string
  password: string
}) {
  return new URLSearchParams({
    username: args.username,
    password: args.password,
    grant_type: 'password',
  }).toString()
}

function redactedRequest(args: {
  endpoint: string
  username: string
}): TraTokenRequestAudit {
  return {
    endpoint: args.endpoint,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: {
      username: args.username,
      password: '***',
      grant_type: 'password',
    },
  }
}

function cacheKey(args: {
  stationId: string
  baseUrl: string
  username: string | null
}) {
  return [args.stationId, resolveTraTokenEndpoint(args.baseUrl), args.username]
    .map((part) => String(part ?? '').trim())
    .join('|')
}

function isCacheEntryValid(entry: TraTokenCacheEntry | undefined) {
  return !!entry && entry.expiresAtMs - TOKEN_EXPIRY_SKEW_MS > Date.now()
}

function tokenTtlMs(payload: TraTokenPayload) {
  const expiresIn = Number(payload.expires_in)
  const seconds =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? expiresIn
      : DEFAULT_TOKEN_TTL_SECONDS
  return seconds * 1000
}

function normalizeAck(value: unknown) {
  const text = String(value ?? '').trim()
  return text.length ? text : null
}

async function parseTokenResponse(response: Response) {
  const raw = await response.text().catch(() => '')
  let payload: TraTokenPayload = {}

  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as TraTokenPayload
    } catch {
      payload = { raw }
    }
  }

  const ackcode = normalizeAck(
    response.headers.get('ackcode') ?? payload.ackcode,
  )
  const ackmsg = normalizeAck(response.headers.get('ackmsg') ?? payload.ackmsg)

  return {
    raw,
    payload: {
      ...payload,
      ...(ackcode ? { ackcode } : {}),
      ...(ackmsg ? { ackmsg } : {}),
    },
    ackcode,
    ackmsg,
  }
}

function resultFromCache(args: {
  endpoint: string
  request: TraTokenRequestAudit | null
  entry: TraTokenCacheEntry
  response?: TraTokenResult['response']
  error?: string | null
}): TraTokenResult {
  return {
    ok: true,
    token: args.entry.token,
    endpoint: args.endpoint,
    fromCache: true,
    skipped: false,
    request: args.request,
    response: args.response ?? {
      httpStatus: null,
      ackcode: normalizeAck(args.entry.payload.ackcode),
      ackmsg: normalizeAck(args.entry.payload.ackmsg),
      payload: args.entry.payload,
      raw: null,
    },
    error: args.error ?? null,
  }
}

export async function requestTraBearerToken(
  args: TraTokenCredentials,
): Promise<TraTokenResult> {
  const endpoint = resolveTraTokenEndpoint(args.baseUrl)
  const username = String(args.username ?? '').trim()
  const password = String(args.password ?? '').trim()

  if (!username || !password) {
    return {
      ok: true,
      token: null,
      endpoint: null,
      fromCache: false,
      skipped: true,
      request: null,
      response: {
        httpStatus: null,
        ackcode: null,
        ackmsg: null,
        payload: null,
        raw: null,
      },
      error: null,
    }
  }

  const key = cacheKey({
    stationId: args.stationId,
    baseUrl: args.baseUrl,
    username,
  })
  const cached = tokenCache.get(key)
  const request = redactedRequest({ endpoint, username })

  if (!args.forceRefresh && isCacheEntryValid(cached)) {
    return resultFromCache({ endpoint, request, entry: cached! })
  }

  const fetcher = args.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: buildTraTokenRequestBody({ username, password }),
    })
  } catch (e: any) {
    if (isCacheEntryValid(cached)) {
      return resultFromCache({
        endpoint,
        request,
        entry: cached!,
        error: `TRA token refresh failed; using cached token: ${String(
          e?.message || e,
        )}`,
      })
    }

    return {
      ok: false,
      token: null,
      endpoint,
      fromCache: false,
      skipped: false,
      request,
      response: {
        httpStatus: null,
        ackcode: null,
        ackmsg: null,
        payload: null,
        raw: null,
      },
      error: `TRA token request failed: ${String(e?.message || e)}`,
    }
  }

  const parsed = await parseTokenResponse(response)
  const responseAudit = {
    httpStatus: response.status,
    ackcode: parsed.ackcode,
    ackmsg: parsed.ackmsg,
    payload: parsed.payload,
    raw: parsed.raw,
  }

  if (!response.ok) {
    const error = `TRA token request failed (${response.status})${
      parsed.raw ? `: ${parsed.raw}` : ''
    }`
    if (isCacheEntryValid(cached)) {
      return resultFromCache({
        endpoint,
        request,
        entry: cached!,
        response: responseAudit,
        error: `${error}; using cached token`,
      })
    }

    return {
      ok: false,
      token: null,
      endpoint,
      fromCache: false,
      skipped: false,
      request,
      response: responseAudit,
      error,
    }
  }

  const ackcode = parsed.ackcode
  if (ackcode && ackcode !== '7') {
    const error = `TRA token request returned ackcode ${ackcode}${
      parsed.ackmsg ? `: ${parsed.ackmsg}` : ''
    }`
    if (isCacheEntryValid(cached)) {
      return resultFromCache({
        endpoint,
        request,
        entry: cached!,
        response: responseAudit,
        error: `${error}; using cached token`,
      })
    }

    return {
      ok: false,
      token: null,
      endpoint,
      fromCache: false,
      skipped: false,
      request,
      response: responseAudit,
      error,
    }
  }

  const token = String(parsed.payload.access_token ?? '').trim()
  if (!token) {
    return {
      ok: false,
      token: null,
      endpoint,
      fromCache: false,
      skipped: false,
      request,
      response: responseAudit,
      error: 'TRA token response did not include access_token',
    }
  }

  tokenCache.set(key, {
    token,
    expiresAtMs: Date.now() + tokenTtlMs(parsed.payload),
    payload: parsed.payload,
  })

  return {
    ok: true,
    token,
    endpoint,
    fromCache: false,
    skipped: false,
    request,
    response: responseAudit,
    error: null,
  }
}

export async function getTraBearerToken(args: TraTokenCredentials) {
  const result = await requestTraBearerToken(args)
  if (!result.ok) {
    throw new Error(result.error || 'TRA token request failed')
  }
  return result.token
}

export function clearTraTokenCacheForTests() {
  tokenCache.clear()
}
