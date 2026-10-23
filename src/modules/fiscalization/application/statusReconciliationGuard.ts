import type { ProxyInvoiceResponse } from '@/src/shared/fiscalization/proxy/contracts'
import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { FiscalStatusResolution } from '../domain/statusPolicy'
import { normalizeRegisteredCountry } from './countryRegistry'
import { getCountryStatusNormalizer } from './statusPolicyRegistry'

export interface StatusReconciliationDecision {
  readonly countryCode: FiscalCountryCode
  readonly transactionDocumentId: string
  readonly resolution: FiscalStatusResolution
  readonly canMarkFiscalized: boolean
  readonly canAutomaticallyResubmit: false
  readonly requiresManualReview: boolean
  readonly reason: string
}

/**
 * Pure, side-effect-free gate for later recovery integration.
 * Never use a status result to mark a different transaction as fiscalized.
 * An absent document ID in the response is NOT proof of correlation.
 */
export function evaluateStatusReconciliation(
  country: unknown,
  transactionDocumentId: string,
  response: ProxyInvoiceResponse,
): StatusReconciliationDecision {
  const countryCode = normalizeRegisteredCountry(country)
  const expected = transactionDocumentId.trim()
  if (!expected) throw new Error('Transaction document ID is required')
  const resolution = getCountryStatusNormalizer(countryCode)(response)
  const responseId = resolution.documentId?.trim() ?? ''
  const correlated = responseId.length > 0 && responseId === expected
  const canMarkFiscalized = correlated && resolution.state === 'fiscalized'
  const reason = !correlated
    ? 'Status document ID missing or does not match the transaction'
    : resolution.reason
  return {
    countryCode,
    transactionDocumentId: expected,
    resolution,
    canMarkFiscalized,
    canAutomaticallyResubmit: false,
    requiresManualReview: !canMarkFiscalized,
    reason,
  }
}
