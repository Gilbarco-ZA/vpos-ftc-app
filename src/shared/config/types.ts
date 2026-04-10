export type JsonObject = Record<string, unknown>

export type StationConfigDbRow = {
  station_id: string
  schema_version: string
  config_json: JsonObject
  created_at: string
  updated_at: string
}

export interface StationConfigRow {
  stationId: string
  schemaVersion: string
  configJson: JsonObject
  createdAt: string
  updatedAt: string
}

export interface ConfigImportRow {
  id: string
  stationId: string
  sourcePath: string
  sourceChecksum: string
  status: string
  message?: string | null
  importedAt: string
}
