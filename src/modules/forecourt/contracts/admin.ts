export type ForecourtEventRow = {
  id: string
  station_id: string
  source: string
  apc: string | null
  event_type: string
  payload: Record<string, unknown>
  occurred_at: string
  received_at: string
}
