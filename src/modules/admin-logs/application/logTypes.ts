import type { LogType } from '@/src/shared/logs/service'

export type AdminLogDownloadType = LogType | 'archive'

export function resolveAdminLogType(
  value: string | null,
  fallback: LogType = 'live',
): LogType {
  if (value === 'archive') return 'archive'
  if (value === 'restart') return 'restart'
  if (value === 'live') return 'live'
  return fallback
}

export function resolveAdminLogLines(
  value: string | null,
  fallback = 2000,
  max = 10000,
) {
  const n = Number(value || fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(max, Math.floor(n)))
}

export function sanitizeAdminLogFilename(value: string | null) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
}

export function assertSafeAdminLogFilename(filename: string) {
  if (!filename) throw new Error('filename is required')
  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    throw new Error('invalid filename')
  }
}
