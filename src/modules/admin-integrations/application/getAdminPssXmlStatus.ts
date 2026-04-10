import {
  getPssXmlEnv,
  kvGetMany,
  PSS_XML_KEYS,
} from '@/src/shared/integrations/pssXml'

export async function getAdminPssXmlStatus(stationId: string) {
  const values = await kvGetMany<any>(stationId, [
    PSS_XML_KEYS.LAST_IMPORT_AT,
    PSS_XML_KEYS.LAST_IMPORT_CHECKSUM,
    PSS_XML_KEYS.LAST_IMPORT_ERROR,
    PSS_XML_KEYS.LAST_EXPORT_AT,
    PSS_XML_KEYS.LAST_EXPORT_ERROR,
    PSS_XML_KEYS.PARSED_JSON,
  ])
  const lastImportAt = values[PSS_XML_KEYS.LAST_IMPORT_AT] as string | null
  const lastImportChecksum = values[PSS_XML_KEYS.LAST_IMPORT_CHECKSUM] as
    | string
    | null
  const lastImportError = values[PSS_XML_KEYS.LAST_IMPORT_ERROR] as
    | string
    | null
  const lastExportAt = values[PSS_XML_KEYS.LAST_EXPORT_AT] as string | null
  const lastExportError = values[PSS_XML_KEYS.LAST_EXPORT_ERROR] as
    | string
    | null
  const parsed = values[PSS_XML_KEYS.PARSED_JSON]

  return {
    ...getPssXmlEnv(),
    lastImportAt,
    lastImportChecksum,
    lastImportError,
    lastExportAt,
    lastExportError,
    parsedSummary: parsed
      ? {
          grades: Array.isArray(parsed.grades) ? parsed.grades.length : 0,
          tanks: Array.isArray(parsed.tanks) ? parsed.tanks.length : 0,
          fuellingPoints: Array.isArray(parsed.fuellingPoints)
            ? parsed.fuellingPoints.length
            : 0,
        }
      : null,
  }
}
