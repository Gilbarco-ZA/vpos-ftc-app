export const STATUS_VARIANTS = [
  'success',
  'warn',
  'error',
  'info',
  'neutral',
] as const

export const STATUS_VARIANT = {
  SUCCESS: 'success',
  WARN: 'warn',
  ERROR: 'error',
  INFO: 'info',
  NEUTRAL: 'neutral',
} as const

export const ACTION_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
} as const

export type ActionStatus = (typeof ACTION_STATUS)[keyof typeof ACTION_STATUS]

export type StatusVariant = (typeof STATUS_VARIANTS)[number]

export const TOAST_VARIANTS = ['success', 'error', 'info'] as const
export type ToastVariant = (typeof TOAST_VARIANTS)[number]

export const ALERT_VARIANTS = ['success', 'warn', 'error', 'info'] as const
export type AlertVariant = (typeof ALERT_VARIANTS)[number]

export const FORECOURT_CONNECTION_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  DEGRADED: 'degraded',
} as const

export type ForecourtConnectionStatus =
  (typeof FORECOURT_CONNECTION_STATUS)[keyof typeof FORECOURT_CONNECTION_STATUS]

export const PUMP_NOZZLE_STATE = {
  IDLE: 'idle',
  AUTH: 'auth',
  PREAUTHORIZED: 'preauthorized',
  CALLING: 'calling',
  STARTING: 'starting',
  NOZZLE_UP: 'nozzle_up',
  NOZZLE_DOWN: 'nozzle_down',
  DISPENSING: 'dispensing',
  DISPENSING_PAUSED: 'dispensing_paused',
  ERROR: 'error',
  CLOSED: 'closed',
  UNAVAILABLE: 'unavailable',
  UNCONFIGURED: 'unconfigured',
} as const

export type PumpNozzleState =
  (typeof PUMP_NOZZLE_STATE)[keyof typeof PUMP_NOZZLE_STATE]

export const SIM_PUMP_STATE = {
  IDLE: 'IDLE',
  CALL: 'CALL',
  DISPENSING: 'DISPENSING',
  PAUSED: 'PAUSED',
  TRANS_READY: 'TRANS_READY',
} as const

export type SimPumpState = (typeof SIM_PUMP_STATE)[keyof typeof SIM_PUMP_STATE]

export const BUFFER_SEVERITY = {
  OK: 'ok',
  WARN: 'warn',
  CRIT: 'crit',
} as const

export type BufferSeverity =
  (typeof BUFFER_SEVERITY)[keyof typeof BUFFER_SEVERITY]
