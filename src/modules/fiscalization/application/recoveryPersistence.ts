import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { FiscalRecoveryAssessment } from './statusRecoveryService'

export interface FiscalRecoveryRecord {
  stationId: string
  documentId: string
  countryCode: FiscalCountryCode
  state: 'fiscalizing' | 'fiscalized' | 'failed' | 'pending'
  version: number
}

export interface ConfirmFiscalizedCommand {
  stationId: string
  documentId: string
  countryCode: FiscalCountryCode
  expectedVersion: number
  expectedState: 'fiscalizing'
  audit: { source: 'proxy-status-reconciliation'; observedStatus: string; documentId: string }
}

export type FiscalRecoveryWriteResult =
  | { outcome: 'updated'; version: number }
  | { outcome: 'already-fiscalized' }
  | { outcome: 'stale' | 'not-found' }

/**
 * The adapter MUST implement an atomic compare-and-set with the audit record
 * in the same database transaction. Neither a read nor this interface is a lock.
 */
export interface FiscalRecoveryPersistencePort {
  read(stationId: string, documentId: string): Promise<FiscalRecoveryRecord | null>
  confirmFiscalized(command: ConfirmFiscalizedCommand): Promise<FiscalRecoveryWriteResult>
}

export type FiscalRecoveryApplyResult =
  | { outcome: 'applied' | 'already-fiscalized' | 'stale' | 'not-found'; canAutomaticallyResubmit: false }
  | { outcome: 'not-confirmed' | 'invalid-record'; canAutomaticallyResubmit: false }

/**
 * Isolated test-only coordinator. A later DB port must re-check station,
 * document, country, version and state atomically before any transition.
 */
export async function applyConfirmedFiscalRecovery(
  port: FiscalRecoveryPersistencePort,
  assessment: FiscalRecoveryAssessment,
): Promise<FiscalRecoveryApplyResult> {
  const safe = { canAutomaticallyResubmit: false as const }
  if (assessment.outcome !== 'confirmed' || !assessment.canMarkFiscalized ||
    assessment.decision?.resolution.documentId !== assessment.documentId ||
    assessment.decision.countryCode !== assessment.countryCode) {
    return { ...safe, outcome: 'not-confirmed' }
  }
  const current = await port.read(assessment.stationId, assessment.documentId)
  if (!current) return { ...safe, outcome: 'not-found' }
  if (current.stationId !== assessment.stationId ||
    current.documentId !== assessment.documentId ||
    current.countryCode !== assessment.countryCode ||
    !Number.isSafeInteger(current.version) || current.version < 0) {
    return { ...safe, outcome: 'invalid-record' }
  }
  if (current.state === 'fiscalized') return { ...safe, outcome: 'already-fiscalized' }
  if (current.state !== 'fiscalizing') return { ...safe, outcome: 'stale' }
  const result = await port.confirmFiscalized({
    stationId: current.stationId,
    documentId: current.documentId,
    countryCode: current.countryCode,
    expectedVersion: current.version,
    expectedState: 'fiscalizing',
    audit: {
      source: 'proxy-status-reconciliation',
      observedStatus: assessment.decision.resolution.sourceStatus ?? 'CONFIRMED',
      documentId: assessment.documentId,
    },
  })
  return { ...safe, outcome: result.outcome === 'updated' ? 'applied' : result.outcome }
}
