import type { PssXmlConfig, PssXmlImportSummary } from './types'

const countArray = (value: unknown) => (Array.isArray(value) ? value.length : 0)

const countGradeOptions = (fuellingPoints: unknown) =>
  Array.isArray(fuellingPoints)
    ? fuellingPoints.reduce((sum, point) => {
        if (!point || typeof point !== 'object') return sum
        return (
          sum + countArray((point as { gradeOptions?: unknown }).gradeOptions)
        )
      }, 0)
    : 0

export function buildPssXmlImportSummary(input: {
  parsed: PssXmlConfig
  sourceChecksum: string
  sourcePath?: string | null
  importedAt: string
  sourceBytes: number
  importedProducts: number
  importedTanks: number
  importedPumps: number
}): PssXmlImportSummary {
  const { parsed } = input
  return {
    version: 1,
    sourceChecksum: String(input.sourceChecksum || '').trim(),
    sourcePath: input.sourcePath
      ? String(input.sourcePath).trim() || null
      : null,
    importedAt: String(input.importedAt || '').trim(),
    sourceBytes: Math.max(0, Math.floor(Number(input.sourceBytes) || 0)),
    parsedCounts: {
      grades: countArray(parsed.grades),
      priceGroups: countArray(parsed.priceGroups),
      products: countArray(parsed.products),
      tanks: countArray(parsed.tanks),
      tankGauges: countArray(parsed.tankGauges),
      fuellingPoints: countArray(parsed.fuellingPoints),
      gradeOptions: countGradeOptions(parsed.fuellingPoints),
    },
    normalizedCounts: {
      products: Math.max(0, Math.floor(Number(input.importedProducts) || 0)),
      tanks: Math.max(0, Math.floor(Number(input.importedTanks) || 0)),
      pumps: Math.max(0, Math.floor(Number(input.importedPumps) || 0)),
    },
  }
}

export function isPssXmlImportSummary(
  value: unknown,
): value is PssXmlImportSummary {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PssXmlImportSummary>
  return (
    candidate.version === 1 &&
    typeof candidate.sourceChecksum === 'string' &&
    typeof candidate.importedAt === 'string' &&
    !!candidate.parsedCounts &&
    typeof candidate.parsedCounts.grades === 'number' &&
    typeof candidate.parsedCounts.tanks === 'number' &&
    typeof candidate.parsedCounts.fuellingPoints === 'number'
  )
}

export function summarizeLegacyParsedPssXml(input: {
  parsed: unknown
  sourceChecksum?: string | null
  importedAt?: string | null
}): PssXmlImportSummary | null {
  if (!input.parsed || typeof input.parsed !== 'object') return null
  const parsed = input.parsed as Partial<PssXmlConfig>
  const importedAt = String(input.importedAt || '').trim()
  const sourceChecksum = String(input.sourceChecksum || '').trim()

  return {
    version: 1,
    sourceChecksum,
    sourcePath: null,
    importedAt,
    sourceBytes: 0,
    parsedCounts: {
      grades: countArray(parsed.grades),
      priceGroups: countArray(parsed.priceGroups),
      products: countArray(parsed.products),
      tanks: countArray(parsed.tanks),
      tankGauges: countArray(parsed.tankGauges),
      fuellingPoints: countArray(parsed.fuellingPoints),
      gradeOptions: countGradeOptions(parsed.fuellingPoints),
    },
    normalizedCounts: {
      products: 0,
      tanks: 0,
      pumps: 0,
    },
  }
}
