'use client'

import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'

type ErrorDetailsProps = {
  title: string
  message: string
  error: unknown
}

type NormalizedErrorInfo = {
  titleMessage?: string
  code?: string
  status?: number
  details?: unknown
  raw?: unknown
}

const MAX_DETAILS_LENGTH = 4000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const truncate = (value: string, max = MAX_DETAILS_LENGTH) =>
  value.length > max ? `${value.slice(0, max)}…` : value

const sanitizeString = (value: string) => {
  const lines = value.split('\n')
  const filtered = lines.filter((line) => !line.trim().startsWith('at '))
  return filtered.join('\n').trim()
}

const safeStringify = (value: unknown) => {
  const seen = new WeakSet()
  return JSON.stringify(
    value,
    (key, val) => {
      if (key.toLowerCase() === 'stack') return undefined
      if (typeof val === 'function') return undefined
      if (isRecord(val)) {
        if (seen.has(val)) return '[Circular]'
        seen.add(val)
      }
      return val
    },
    2,
  )
}

const extractErrorInfo = (error: unknown): NormalizedErrorInfo => {
  if (!error) return { raw: error }

  if (typeof error === 'string') {
    return { titleMessage: sanitizeString(error), raw: error }
  }

  if (error instanceof Error) {
    return { titleMessage: sanitizeString(error.message), raw: error }
  }

  if (isRecord(error)) {
    const status =
      typeof error.status === 'number'
        ? error.status
        : typeof error.statusCode === 'number'
          ? error.statusCode
          : typeof error.httpStatus === 'number'
            ? error.httpStatus
            : undefined

    const body = isRecord(error.body) ? error.body : error
    const okFalse = body.ok === false
    const bodyError = isRecord(body.error) ? body.error : undefined
    const message =
      (typeof bodyError?.message === 'string' && bodyError.message) ||
      (typeof body.message === 'string' && body.message) ||
      (typeof (error as any).message === 'string' && (error as any).message) ||
      undefined

    const code =
      typeof bodyError?.code === 'string' ? bodyError.code : undefined
    const details = bodyError?.details ?? body.details

    return {
      titleMessage: message ? sanitizeString(message) : undefined,
      code,
      status,
      details,
      raw: okFalse ? body : error,
    }
  }

  return { raw: error }
}

const deriveGuidance = (info: NormalizedErrorInfo) => {
  const haystack = `${info.titleMessage ?? ''} ${info.code ?? ''}`.toLowerCase()
  if (haystack.includes('timeout') || haystack.includes('timed out')) {
    return 'The request timed out. Check connectivity to the proxy and try again.'
  }
  if (info.status && [502, 503, 504].includes(info.status)) {
    return 'The proxy is unavailable right now. Try again in a moment.'
  }
  return undefined
}

export const ErrorDetails = ({ title, message, error }: ErrorDetailsProps) => {
  const info = useMemo(() => extractErrorInfo(error), [error])
  const guidance = useMemo(() => deriveGuidance(info), [info])

  const detailsPayload = useMemo(() => {
    if (info.details !== undefined) return info.details
    return info.raw ?? error
  }, [info.details, info.raw, error])

  const detailsText = useMemo(() => {
    if (typeof detailsPayload === 'string') {
      return truncate(sanitizeString(detailsPayload)) || 'Unknown error'
    }
    try {
      const json = safeStringify(detailsPayload)
      return truncate(json || 'Unknown error')
    } catch {
      return 'Unknown error'
    }
  }, [detailsPayload])

  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(detailsText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="rounded-card border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-sm text-[var(--status-error-text)]">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm">{message}</div>
      {guidance && <div className="mt-2 text-sm">{guidance}</div>}
      <details className="mt-3 rounded-lg border border-[var(--status-error-border)] bg-[var(--surface-card)] p-3 text-[var(--text-secondary)]">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">
          Details
        </summary>
        <div className="mt-3 space-y-2 text-xs text-[var(--text-secondary)]">
          {info.status !== undefined && (
            <div>
              <span className="font-semibold text-[var(--text-primary)]">
                HTTP status:
              </span>{' '}
              {info.status}
            </div>
          )}
          {info.code && (
            <div>
              <span className="font-semibold text-[var(--text-primary)]">
                Code:
              </span>{' '}
              {info.code}
            </div>
          )}
          {info.titleMessage && (
            <div>
              <span className="font-semibold text-[var(--text-primary)]">
                Message:
              </span>{' '}
              {info.titleMessage}
            </div>
          )}
          <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-[var(--surface-card)] p-2 text-xs text-[var(--text-secondary)]">
            {detailsText}
          </pre>
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopy}
            >
              {copied ? 'Copied' : 'Copy details'}
            </Button>
          </div>
        </div>
      </details>
    </div>
  )
}

export default ErrorDetails
