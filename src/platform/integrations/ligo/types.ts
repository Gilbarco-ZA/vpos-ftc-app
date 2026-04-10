export type LigoConfig = {
  baseUrl: string
  timeoutMs?: number
  apiKey?: string
}

export type PosCommand = { type: string; payload?: any }

export type PosCommandResult = {
  ok: boolean
  type: string
  data?: any
  error?: string
}
