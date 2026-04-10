export type RequestBody = Record<string, any>
export type QueryValue = string | null

export async function readBody(request: Request): Promise<RequestBody> {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const json = await request.json().catch((): RequestBody => ({}))
    return (json || {}) as RequestBody
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData()
    const body: RequestBody = {}
    for (const [key, value] of form.entries()) {
      body[key] = value
    }
    return body
  }

  try {
    const text = await request.text()
    if (!text) return {}
    return JSON.parse(text) as RequestBody
  } catch {
    return {}
  }
}

export function toInt(value: any, fallback?: number): number | undefined {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function toFloat(value: any, fallback?: number): number | undefined {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function toBool(value: any, fallback?: boolean): boolean | undefined {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'boolean') return value

  const normalized = String(value).toLowerCase()
  if (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'on' ||
    normalized === 'yes'
  ) {
    return true
  }
  if (
    normalized === 'false' ||
    normalized === '0' ||
    normalized === 'off' ||
    normalized === 'no'
  ) {
    return false
  }

  return fallback
}

export function getSearchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams
}

export function getQueryParam(
  request: Request,
  key: string,
  fallback: QueryValue = null,
): QueryValue {
  return getSearchParams(request).get(key) ?? fallback
}

export function getQueryInt(
  request: Request,
  key: string,
  fallback?: number,
): number | undefined {
  return toInt(getQueryParam(request, key), fallback)
}

export function getQueryFloat(
  request: Request,
  key: string,
  fallback?: number,
): number | undefined {
  return toFloat(getQueryParam(request, key), fallback)
}

export function getQueryBool(
  request: Request,
  key: string,
  fallback?: boolean,
): boolean | undefined {
  return toBool(getQueryParam(request, key), fallback)
}

export function wantsHtmlRedirect(req: Request): boolean {
  const accept = req.headers.get('accept') || ''
  return accept.includes('text/html')
}

export function getReturnUrl(req: Request, fallback = '/dashboard'): URL {
  const referrer = req.headers.get('referer')
  if (referrer) {
    try {
      return new URL(referrer)
    } catch {
      // fall through to fallback
    }
  }

  return new URL(fallback, req.url)
}
