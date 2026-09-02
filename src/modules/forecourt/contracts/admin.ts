export type ForecourtEventRow = {
  id: string
  station_id: string
  source: string
  apc: string | null
  event_type: string
  payload: Record<string, unknown>
  retention_class: string
  payload_hash: string | null
  payload_schema_version: number
  payload_compacted_at: string | null
  occurred_at: string
  received_at: string
}
