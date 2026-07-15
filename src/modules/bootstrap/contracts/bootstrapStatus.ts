export type BootstrapStatusPayload = {
  stationId?: string | null
  stationName?: string | null
  userCount: number
  defaultAdminEnabled: boolean
  proxyReachable: boolean
  proxyUrl?: string
  proxyError?: string
  isRegistered: boolean
  [key: string]: unknown
}
