export type RestartReason =
  | 'manual'
  | 'scheduled'
  | 'health'
  | 'safety'
  | 'unknown'

export type RestartConfig = {
  enabled: boolean
  // cron expression in node-cron format
  scheduleCron: string
  // minimal delay between restarts
  minIntervalMs: number
  // safety check configuration
  safetyCheck: {
    enabled: boolean
    requiredConsecutiveSuccesses: number
    maxRetries: number
    retryDelayMs: number
  }
}

export type RestartStatus = {
  status: 'IDLE' | 'RESTARTING' | 'FAILED'
  updatedAt: string
  message?: string
  lastRestartAt?: string
  lastReason?: RestartReason
}

export type SafetyCheckResult = {
  ok: boolean
  message: string
  supervisorStatus?: any
}
