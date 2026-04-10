type ApiResult<T = any> = {
  ok?: boolean
  success: boolean
  data?: T
  error?: string
  message?: string
}

function getBaseUrl() {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL
  if (envBase) return envBase.replace(/\/$/, '')

  const port = process.env.PORT || '3080'
  return `http://localhost:${port}`
}

function resolveUrl(url: string) {
  if (typeof window === 'undefined' && url.startsWith('/')) {
    return `${getBaseUrl()}${url}`
  }
  return url
}

/**
 * Shared fetch helper is a cross-cutting caller contract.
 * Route serialization and response primitives remain platform-owned.
 */
export async function api<T>(
  url: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(resolveUrl(url), {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers || {}),
      },
    })
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ? String(err.message) : 'Network request failed',
    }
  }

  const json = (await res.json().catch(() => ({}))) as any

  if (!res.ok) {
    return {
      success: false,
      error: json?.error || json?.message || `HTTP ${res.status}`,
    }
  }

  if (typeof json?.success === 'boolean') return json as ApiResult<T>

  if (json?.ok === true && 'data' in json) {
    return { success: true, data: json.data as T }
  }

  return { success: true, data: json as T }
}
