import type { PssXmlImportSummary } from '@/src/shared/integrations/pssXml/types'

import { getPssXmlEnv } from '@/src/shared/integrations/pssXml/env'
import {
  isPssXmlImportSummary,
  summarizeLegacyParsedPssXml,
} from '@/src/shared/integrations/pssXml/importSummary'
import { PSS_XML_KEYS } from '@/src/shared/integrations/pssXml/keys'
import { kvGetMany } from '@/src/shared/storage/stationKv'

export async function getAdminPssXmlStatus(stationId: string) {
  const values = await kvGetMany<unknown>(stationId, [
    PSS_XML_KEYS.LAST_IMPORT_AT,
    PSS_XML_KEYS.LAST_IMPORT_CHECKSUM,
    PSS_XML_KEYS.LAST_IMPORT_ERROR,
    PSS_XML_KEYS.LAST_EXPORT_AT,
    PSS_XML_KEYS.LAST_EXPORT_ERROR,
    PSS_XML_KEYS.IMPORT_SUMMARY,
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

  const storedSummary = values[PSS_XML_KEYS.IMPORT_SUMMARY]
  const importSummary: PssXmlImportSummary | null = isPssXmlImportSummary(
    storedSummary,
  )
    ? storedSummary
    : summarizeLegacyParsedPssXml({
        parsed: values[PSS_XML_KEYS.PARSED_JSON],
        sourceChecksum: lastImportChecksum,
        importedAt: lastImportAt,
      })

  return {
    ...getPssXmlEnv(),
    lastImportAt,
    lastImportChecksum,
    lastImportError,
    lastExportAt,
    lastExportError,
    importSummary,
    // Preserve the existing API/UI shape while sourcing it from compact
    // metadata. The parsed PSS object is compatibility-only and never returned.
    parsedSummary: importSummary
      ? {
          grades: importSummary.parsedCounts.grades,
          tanks: importSummary.parsedCounts.tanks,
          fuellingPoints: importSummary.parsedCounts.fuellingPoints,
        }
      : null,
  }
}
