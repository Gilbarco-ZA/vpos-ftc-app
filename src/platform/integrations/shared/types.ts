export type IntegrationConfig = {
  baseUrl: string
  timeoutMs?: number
  apiKey?: string
  basicAuth?: { username: string; password: string }
  provider?: string
  [key: string]: unknown
}

export type IntegrationHealthResult = {
  ok: boolean
  configured: boolean
  provider?: string
  baseUrl?: string
  latencyMs?: number
  status?: number
  error?: string
}

export type IntegrationCommandResult = {
  ok: boolean
  type?: string
  accepted?: boolean
  message?: string
  data?: unknown
  error?: string
}

export type HttpResponse = {
  ok: boolean
  status: number
  json: unknown
  text: string
}
