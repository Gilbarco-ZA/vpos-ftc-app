import '@/src/modules/forecourt/infrastructure/jpl/globals'

import { appendLogLine } from '@/src/shared/logs/service'

import { serializeForLog } from '@/src/modules/forecourt/infrastructure/adapters/jplTcpAdapter.helpers'
import { redactJplSensitivePaymentData } from '@/src/modules/forecourt/infrastructure/jpl/unattendedTransactions'

export const JPL_TRAFFIC_LOG = 'doms-jpl.log'

const shouldSkipTrafficLog = (
  direction: 'recv' | 'send' | 'info' | 'error',
  event: string,
  payload: unknown,
) => {
  const eventText = String(event || '')
    .trim()
    .toLowerCase()
  if (eventText.includes('heartbeat') || ['ping', 'pong'].includes(eventText)) {
    return true
  }

  if (!payload || typeof payload !== 'object') return false

  const candidateValues = [
    (payload as any).type,
    (payload as any).event,
    (payload as any).name,
    (payload as any).messageType,
  ]

  return candidateValues.some((value) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
    return (
      normalized === 'heartbeat' ||
      normalized === 'ping' ||
      normalized === 'pong'
    )
  })
}

export const writeJplTrafficLog = (
  stationId: string,
  direction: 'recv' | 'send' | 'info' | 'error',
  event: string,
  payload: unknown,
) => {
  if (shouldSkipTrafficLog(direction, event, payload)) return

  const stamp = new Date().toISOString()
  const body = serializeForLog(redactJplSensitivePaymentData(payload))
  void appendLogLine(
    stationId,
    'live',
    JPL_TRAFFIC_LOG,
    `[${stamp}] [${direction.toUpperCase()}] ${event}${
      body ? `\n${body}` : ''
    }`,
  ).catch(() => {
    // Never fail forecourt processing because diagnostics logging failed.
  })
}
