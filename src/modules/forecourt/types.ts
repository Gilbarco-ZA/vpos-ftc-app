import type { ForecourtConnectionStatus } from '@/src/shared/status/ui'

export type ForecourtConnectionPayload = {
  stationId: string
  status: ForecourtConnectionStatus
  lastSeenAt: number | null
  reconnectAttempts: number
  connected: boolean
  ageMs: number | null
}
