import fs from 'fs/promises'
import path from 'path'

import { query, queryOne } from '@/src/platform/db/postgres'

export type ProcessCatalogEntry = {
  processType: string
  schemaJson: any
  sourcePath?: string | null
}

export type PluginCatalogEntry = {
  pluginName: string
  metadataJson: any
  schemasJson: Record<string, any>
  sourcePath?: string | null
}

export async function upsertProcessCatalog(entry: ProcessCatalogEntry) {
  await query(
    `INSERT INTO process_catalog (process_type, schema_json, source_path)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (process_type)
     DO UPDATE SET schema_json = EXCLUDED.schema_json,
                   source_path = EXCLUDED.source_path,
                   updated_at = CURRENT_TIMESTAMP`,
    [
      entry.processType,
      JSON.stringify(entry.schemaJson ?? {}),
      entry.sourcePath ?? null,
    ],
  )
}

export async function upsertPluginCatalog(entry: PluginCatalogEntry) {
  await query(
    `INSERT INTO plugin_catalog (plugin_name, metadata_json, schemas_json, source_path)
     VALUES ($1, $2::jsonb, $3::jsonb, $4)
     ON CONFLICT (plugin_name)
     DO UPDATE SET metadata_json = EXCLUDED.metadata_json,
                   schemas_json = EXCLUDED.schemas_json,
                   source_path = EXCLUDED.source_path,
                   updated_at = CURRENT_TIMESTAMP`,
    [
      entry.pluginName,
      JSON.stringify(entry.metadataJson ?? {}),
      JSON.stringify(entry.schemasJson ?? {}),
      entry.sourcePath ?? null,
    ],
  )
}

export async function getProcessSchema(
  processType: string,
): Promise<any | null> {
  const row = await queryOne<{ schema_json: any }>(
    `SELECT schema_json FROM process_catalog WHERE process_type = $1`,
    [processType],
  )
  return row?.schema_json ?? null
}

export async function getPluginSchemas(
  pluginName: string,
): Promise<Record<string, any> | null> {
  const row = await queryOne<{ schemas_json: any }>(
    `SELECT schemas_json FROM plugin_catalog WHERE plugin_name = $1`,
    [pluginName],
  )
  return row?.schemas_json ?? null
}

export async function listCatalogPlugins(): Promise<
  Array<{ plugin_name: string; metadata_json: any; schemas_json: any }>
> {
  const res = await query(
    `SELECT plugin_name, metadata_json, schemas_json FROM plugin_catalog ORDER BY plugin_name ASC`,
  )
  return res.rows as any
}

type LegacyPluginJson = {
  name: string
  version?: string
  description?: string
  author?: string
  required?: boolean
  singleton?: boolean
  countryRestrictions?: string[]
  processType?: Array<{ type: string; configSchema?: string }>
}

async function safeReadJson(fp: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(fp, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function scanAndUpsertPluginCatalog(pluginRoot: string): Promise<{
  processes: number
  plugins: number
  warnings: string[]
}> {
  const warnings: string[] = []
  let processes = 0
  let plugins = 0

  const entries = await fs.readdir(pluginRoot, { withFileTypes: true })
  for (const procDir of entries) {
    if (!procDir.isDirectory()) continue
    const processType = procDir.name
    const processPath = path.join(pluginRoot, processType)
    const processJson = await safeReadJson(
      path.join(processPath, 'process.json'),
    )
    const schemaJson = (processJson?.configSchema ?? processJson ?? {}) as any

    await upsertProcessCatalog({
      processType,
      schemaJson,
      sourcePath: path.join(processPath, 'process.json'),
    })
    processes += 1

    const pluginDirs = await fs
      .readdir(processPath, { withFileTypes: true })
      .catch(() => [])
    for (const plDir of pluginDirs) {
      if (!plDir.isDirectory()) continue
      const plPath = path.join(processPath, plDir.name)
      const pluginJsonPath = path.join(plPath, 'plugin.json')
      const meta = (await safeReadJson(
        pluginJsonPath,
      )) as LegacyPluginJson | null
      if (!meta?.name) {
        continue
      }

      const schemasByProcess: Record<string, any> = {}
      for (const pt of meta.processType ?? []) {
        const t = String(pt?.type ?? processType)
        const schemaRef = pt?.configSchema
        if (schemaRef) {
          const schemaFp = path.join(plPath, schemaRef)
          const schema = await safeReadJson(schemaFp)
          if (schema) schemasByProcess[t] = schema
          else warnings.push(`Missing schema for ${meta.name}: ${schemaFp}`)
        }
      }

      if (!Object.keys(schemasByProcess).length) {
        schemasByProcess[processType] = {}
      }

      await upsertPluginCatalog({
        pluginName: meta.name,
        metadataJson: meta,
        schemasJson: schemasByProcess,
        sourcePath: pluginJsonPath,
      })
      plugins += 1
    }
  }

  return { processes, plugins, warnings }
}
