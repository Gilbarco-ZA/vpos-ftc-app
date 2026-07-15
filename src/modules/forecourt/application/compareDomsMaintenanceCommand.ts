import {
  canonicalizeDomsMaintenanceValue as canonicalize,
  digestDomsMaintenanceValue as digest,
  validateDomsMaintenanceEnvelope as validateEnvelope,
} from './domsMaintenanceCommandDigest'

export type DomsMaintenanceCommandComparisonInput = {
  previewId?: unknown
  previewEnvelope?: unknown
  executableEnvelope?: unknown
  confirmComparisonOnly?: unknown
  confirmNoDomsCommand?: unknown
}

type Difference = {
  path: string
  preview: unknown
  executable: unknown
  kind: 'added' | 'removed' | 'changed'
}

const requireTrue = (value: unknown, fieldName: string) => {
  if (value !== true) throw new Error(`${fieldName} must be confirmed`)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const collectDifferences = (
  preview: unknown,
  executable: unknown,
  path = '$',
  output: Difference[] = [],
): Difference[] => {
  if (Object.is(preview, executable)) return output

  if (Array.isArray(preview) && Array.isArray(executable)) {
    const length = Math.max(preview.length, executable.length)
    for (let index = 0; index < length; index += 1) {
      const nextPath = `${path}[${index}]`
      if (index >= preview.length) {
        output.push({
          path: nextPath,
          preview: undefined,
          executable: executable[index],
          kind: 'added',
        })
      } else if (index >= executable.length) {
        output.push({
          path: nextPath,
          preview: preview[index],
          executable: undefined,
          kind: 'removed',
        })
      } else {
        collectDifferences(preview[index], executable[index], nextPath, output)
      }
    }
    return output
  }

  if (isRecord(preview) && isRecord(executable)) {
    const keys = new Set([...Object.keys(preview), ...Object.keys(executable)])
    for (const key of [...keys].sort()) {
      const nextPath = `${path}.${key}`
      if (!(key in preview)) {
        output.push({
          path: nextPath,
          preview: undefined,
          executable: executable[key],
          kind: 'added',
        })
      } else if (!(key in executable)) {
        output.push({
          path: nextPath,
          preview: preview[key],
          executable: undefined,
          kind: 'removed',
        })
      } else {
        collectDifferences(preview[key], executable[key], nextPath, output)
      }
    }
    return output
  }

  output.push({ path, preview, executable, kind: 'changed' })
  return output
}

export function compareDomsMaintenanceCommandEnvelopes(
  input: DomsMaintenanceCommandComparisonInput,
) {
  requireTrue(input.confirmComparisonOnly, 'confirmComparisonOnly')
  requireTrue(input.confirmNoDomsCommand, 'confirmNoDomsCommand')

  const previewEnvelope = validateEnvelope(
    input.previewEnvelope,
    'previewEnvelope',
  )
  const executableEnvelope = validateEnvelope(
    input.executableEnvelope,
    'executableEnvelope',
  )
  const canonicalPreview = canonicalize(previewEnvelope)
  const canonicalExecutable = canonicalize(executableEnvelope)
  const differences = collectDifferences(canonicalPreview, canonicalExecutable)
  const exactMatch = differences.length === 0

  return {
    previewId: String(input.previewId ?? '').trim() || null,
    comparedAt: new Date().toISOString(),
    exactMatch,
    canAdvanceToFinalConfirmation: false,
    executionEnabled: false,
    sendsDomsCommand: false,
    previewDigest: digest(canonicalPreview),
    executableDigest: digest(canonicalExecutable),
    differenceCount: differences.length,
    differences,
    blockers: exactMatch
      ? [
          'The envelopes match, but DOMS/PSS maintenance execution remains hard-disabled.',
          'A matching comparison is evidence only and is not authorization to send the command.',
        ]
      : [
          'The executable candidate differs from the approved preview.',
          'Regenerate and re-review the preview before any future execution workflow.',
          'DOMS/PSS maintenance execution remains hard-disabled.',
        ],
    safetyNotice:
      'This comparison is deterministic and side-effect free. No socket, DOMS client, or PSS write path is invoked.',
  }
}
