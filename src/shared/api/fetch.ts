type ApiResult<T = any> = {
  ok?: boolean
  success: boolean
  data?: T
  error?: string
  message?: string
}

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const nonEmptyText = (value: unknown) => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const collectErrorMessages = (
  value: unknown,
  seen: WeakSet<object>,
): string[] => {
  if (value == null) return []

  if (typeof value === 'string') {
    const message = value.trim()
    return message ? [message] : []
  }

  if (value instanceof Error) {
    const message = value.message.trim()
    return message ? [message] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectErrorMessages(item, seen))
  }

  if (!isRecord(value) || seen.has(value)) return []
  seen.add(value)

  const directMessage = nonEmptyText(value.message)
  const nestedError = collectErrorMessages(value.error, seen)
  const originalMessage = isRecord(value.details)
    ? nonEmptyText(value.details.originalMessage)
    : ''

  return [directMessage, ...nestedError, originalMessage].filter(Boolean)
}

const getApiErrorMessage = (value: unknown, fallback: string) => {
  const messages = [...new Set(collectErrorMessages(value, new WeakSet()))]
  const record = isRecord(value) ? value : null
  const nestedError = record && isRecord(record.error) ? record.error : null
  const code =
    nonEmptyText(nestedError?.code) || nonEmptyText(record?.code) || undefined
  const requestId =
    nonEmptyText(nestedError?.requestId) ||
    nonEmptyText(record?.requestId) ||
    undefined

  let message = messages.join(' ') || fallback
  if (code && !message.includes(code)) message = `${message} [${code}]`
  if (requestId && !message.includes(requestId)) {
    message = `${message} (Support code: ${requestId})`
  }
  return message
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
      error: getApiErrorMessage(err, 'Network request failed'),
    }
  }

  const json = (await res.json().catch(() => ({}))) as any

  if (!res.ok) {
    return {
      success: false,
      error: getApiErrorMessage(json, `HTTP ${res.status}`),
    }
  }

  if (typeof json?.success === 'boolean') {
    if (!json.success) {
      return {
        ...json,
        success: false,
        error: getApiErrorMessage(json, 'Request failed'),
      } as ApiResult<T>
    }
    return json as ApiResult<T>
  }

  if (json?.ok === false) {
    return {
      success: false,
      error: getApiErrorMessage(json, 'Request failed'),
    }
  }

  if (json?.ok === true && 'data' in json) {
    return { success: true, data: json.data as T }
  }

  return { success: true, data: json as T }
}
