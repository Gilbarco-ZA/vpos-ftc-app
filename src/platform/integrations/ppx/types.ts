export type PpxConfig = {
  baseUrl: string
  timeoutMs?: number
  apiKey?: string
  /** optional override paths */
  healthPath?: string
  commandPath?: string
}

export type PosCommand = { type: string; payload?: any }

export type PosCommandResult = {
  ok: boolean
  type: string
  data?: any
  error?: string
}
