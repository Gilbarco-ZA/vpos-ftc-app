import fs from 'node:fs/promises'
import path from 'node:path'
import type { PssXmlIdMap } from '@/src/shared/integrations/pssXml/types'
import type { PssXmlPumpMapping } from '@/src/shared/integrations/pssXml/xml'

import { PSS_XML_KEYS } from '@/src/shared/integrations/pssXml/keys'
import { patchPssXmlFuellingPoints } from '@/src/shared/integrations/pssXml/xml'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import { getPumpsConfigFromDb } from '@/src/modules/setup/infrastructure/setupRepo'

const safeTrim = (v: unknown) => String(v ?? '').trim()

const invertTankMap = (idMap: PssXmlIdMap | null | undefined) => {
  const out = new Map<string, string>()
  const tankDbIdByTankId = idMap?.tankDbIdByTankId || {}
  for (const [pssTankId, dbTankId] of Object.entries(tankDbIdByTankId)) {
    if (pssTankId && dbTankId) out.set(String(dbTankId), String(pssTankId))
  }
  return out
}

const parsePssTankIdFromCode = (code: string | undefined) => {
  if (!code) return null
  const m = String(code).match(/PSS_TANK_(\d+)/i)
  return m?.[1] ? String(m[1]) : null
}

const atomicWriteFile = async (filePath: string, content: string) => {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  const tmp = path.join(dir, `.${base}.tmp`)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, filePath)
}

export type ExportPssXmlResult = {
  xml: string
  pumpCount: number
  outPath?: string
}

/**
 * Export current VPOS pump/nozzle mapping back into a PSS XML file.
 *
 * Strategy:
 * - Use the last imported raw XML as a baseline.
 * - Patch only <Devices><FuellingPoints>...<GradeOptions> sections.
 * - Write to outPath atomically.
 */
export const exportPssConfigXml = async (args: {
  stationId: string
  outPath?: string
  fallbackInPath?: string
}): Promise<ExportPssXmlResult> => {
  const { stationId, outPath, fallbackInPath } = args

  let rawXml = await kvGet<string>(stationId, PSS_XML_KEYS.RAW_XML)
  if (!rawXml && fallbackInPath) {
    rawXml = await safeAsync(
      fs.readFile(fallbackInPath, 'utf8'),
      'pssXml.exporter.readFallback',
    )
  }
  if (!rawXml) {
    throw new Error(
      'No PSS XML baseline found. Import must run at least once (or provide fallbackInPath).',
    )
  }

  const idMap = (await kvGet<PssXmlIdMap>(stationId, PSS_XML_KEYS.ID_MAP)) as
    | PssXmlIdMap
    | null
    | undefined

  const dbTankToPss = invertTankMap(idMap)

  const dbCfg = await getPumpsConfigFromDb(stationId)

  const pumpMappings: PssXmlPumpMapping[] = (dbCfg?.pumps || [])
    .map((p) => {
      const pumpId = safeTrim(p.pumpId)
      if (!pumpId) return null

      const nozzles = (p.nozzles || [])
        .map((n: any) => {
          const nozzleId = safeTrim(n.nozzleId)
          const gradeId = safeTrim(n.productId) || safeTrim(n.productCode)
          const dbTankId = safeTrim(n.tankId)
          if (!nozzleId || !dbTankId) return null

          const pssTankId =
            dbTankToPss.get(dbTankId) || parsePssTankIdFromCode(n.tankCode)

          if (!pssTankId) return null
          if (!gradeId) return null

          return {
            nozzleId,
            gradeId,
            tankId: pssTankId,
          }
        })
        .filter(Boolean) as Array<{
        nozzleId: string
        gradeId: string
        tankId: string
      }>

      return nozzles.length ? { pumpId, nozzles } : null
    })
    .filter(Boolean) as PssXmlPumpMapping[]

  const nextXml = patchPssXmlFuellingPoints({ xml: rawXml, pumpMappings })

  if (outPath) {
    await atomicWriteFile(outPath, nextXml)
  }

  await Promise.all([
    kvSet(stationId, PSS_XML_KEYS.LAST_EXPORT_AT, new Date().toISOString()),
    kvSet(stationId, PSS_XML_KEYS.LAST_EXPORT_ERROR, null),
  ])

  return { xml: nextXml, pumpCount: pumpMappings.length, outPath }
}
