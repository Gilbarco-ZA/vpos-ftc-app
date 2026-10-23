import type { InvoiceStatusFiscalEvidence } from './invoiceStatusFiscalEvidence'
import type { ProxyInvoiceResponse } from '@/src/shared/fiscalization/proxy/contracts'
import type { FiscalCountryCode } from '../domain/countryAdapter'
import { normalizeRegisteredCountry } from './countryRegistry'
import { evaluateStatusReconciliation } from './statusReconciliationGuard'
import type { StatusReconciliationDecision } from './statusReconciliationGuard'

export interface FiscalStatusLookupRequest {
  countryCode: FiscalCountryCode
  stationId: string
  documentId: string
}

export type FiscalStatusLookupResult =
  | { kind: 'response'; response: ProxyInvoiceResponse; fiscalEvidence?: InvoiceStatusFiscalEvidence }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'transport-error'; reason: string }

/**
 * Implemented by a future infrastructure adapter only after country API review.
 * Do not wire the live proxy client here: this orchestration is test-only.
 */
export interface FiscalStatusLookupPort {
  lookup(request: FiscalStatusLookupRequest): Promise<FiscalStatusLookupResult>
}

export interface FiscalRecoveryAssessment {
  countryCode: FiscalCountryCode
  stationId: string
  documentId: string
  outcome: 'confirmed' | 'unresolved' | 'lookup-unavailable' | 'transport-error'
  decision?: StatusReconciliationDecision
  canMarkFiscalized: boolean
  canAutomaticallyResubmit: false
  reason: string
  fiscalEvidence?: InvoiceStatusFiscalEvidence
}

/** A lookup result is advisory until a future locked persistence workflow verifies it. */
export async function assessFiscalStatusRecovery(
  port: FiscalStatusLookupPort,
  args: { country: unknown; stationId: string; documentId: string },
): Promise<FiscalRecoveryAssessment> {
  const countryCode = normalizeRegisteredCountry(args.country)
  const stationId = args.stationId.trim()
  const documentId = args.documentId.trim()
  if (!stationId || !documentId) throw new Error('Station ID and document ID are required')
  const base = { countryCode, stationId, documentId, canAutomaticallyResubmit: false as const }
  let result: FiscalStatusLookupResult
  try {
    result = await port.lookup({ countryCode, stationId, documentId })
  } catch {
    return { ...base, outcome: 'transport-error', canMarkFiscalized: false,
      reason: 'Status lookup failed; outcome must be reconciled before any resubmission' }
  }
  if (result.kind !== 'response') {
    return { ...base, outcome: result.kind === 'unavailable' ? 'lookup-unavailable' : 'transport-error',
      canMarkFiscalized: false, reason: result.reason }
  }
  const decision = evaluateStatusReconciliation(countryCode, documentId, result.response)
  return { ...base, decision, fiscalEvidence: result.fiscalEvidence,
    outcome: decision.canMarkFiscalized ? 'confirmed' : 'unresolved',
    canMarkFiscalized: decision.canMarkFiscalized,
    reason: decision.reason }
}
