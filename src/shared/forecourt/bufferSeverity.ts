import type { PumpBufferHealth } from '@/src/shared/forecourt/bufferHealthTypes'
import type { BufferSeverity } from '@/src/shared/status/ui'

import { BUFFER_SEVERITY } from '@/src/shared/status/ui'

export type { PumpBufferHealth }

export type BufferThresholds = {
  bufferWarnDepthSup: number
  bufferCritDepthSup: number
  bufferWarnAgeMinSup: number
  bufferCritAgeMinSup: number
  bufferWarnDepthUnsup: number
  bufferCritDepthUnsup: number
  bufferWarnAgeMinUnsup: number
  bufferCritAgeMinUnsup: number
}

export const DEFAULT_BUFFER_THRESHOLDS: BufferThresholds = {
  bufferWarnDepthSup: 25,
  bufferCritDepthSup: 100,
  bufferWarnAgeMinSup: 5,
  bufferCritAgeMinSup: 15,
  bufferWarnDepthUnsup: 10,
  bufferCritDepthUnsup: 25,
  bufferWarnAgeMinUnsup: 2,
  bufferCritAgeMinUnsup: 5,
}

export function computeBufferSeverity(
  mode: 'supervised' | 'unsupervised',
  health: PumpBufferHealth,
  thresholds: BufferThresholds = DEFAULT_BUFFER_THRESHOLDS,
  now = Date.now(),
): BufferSeverity {
  const depth = Number(health?.depth ?? 0)
  const warnDepth =
    mode === 'supervised'
      ? thresholds.bufferWarnDepthSup
      : thresholds.bufferWarnDepthUnsup
  const critDepth =
    mode === 'supervised'
      ? thresholds.bufferCritDepthSup
      : thresholds.bufferCritDepthUnsup
  const warnAgeMs =
    (mode === 'supervised'
      ? thresholds.bufferWarnAgeMinSup
      : thresholds.bufferWarnAgeMinUnsup) *
    60 *
    1000
  const critAgeMs =
    (mode === 'supervised'
      ? thresholds.bufferCritAgeMinSup
      : thresholds.bufferCritAgeMinUnsup) *
    60 *
    1000
  const lastActionAt =
    mode === 'supervised'
      ? (health?.lastClearAt ?? health?.lastReadAt ?? null)
      : (health?.lastReadAt ?? null)

  if (depth >= critDepth) return BUFFER_SEVERITY.CRIT
  if (depth >= warnDepth) return BUFFER_SEVERITY.WARN

  if (depth > 0) {
    const age = lastActionAt
      ? now - Number(lastActionAt)
      : Number.POSITIVE_INFINITY
    if (age >= critAgeMs) return BUFFER_SEVERITY.CRIT
    if (age >= warnAgeMs) return BUFFER_SEVERITY.WARN
  }

  if (health?.lastError) return BUFFER_SEVERITY.WARN
  return BUFFER_SEVERITY.OK
}

export function severityBadgeClass(severity: BufferSeverity) {
  switch (severity) {
    case BUFFER_SEVERITY.CRIT:
      return 'bg-red-100 text-red-800 border-red-200'
    case BUFFER_SEVERITY.WARN:
      return 'bg-amber-100 text-amber-800 border-amber-200'
    default:
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  }
}
