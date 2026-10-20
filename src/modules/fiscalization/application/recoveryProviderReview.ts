import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { InvoiceStatusFiscalEvidence } from './invoiceStatusFiscalEvidence'
import { inspectRecoveryProviderFields } from './recoveryProviderFieldInventory'

export type ProviderFieldName = keyof InvoiceStatusFiscalEvidence
export type ProviderFieldReviewStatus = 'missing' | 'status-only' | 'event-only' | 'matching' | 'conflicting' | 'invalid-event'

export interface ProviderFieldReview {
  field: ProviderFieldName
  status: ProviderFieldReviewStatus
  /** Intentionally does not expose raw fiscal identifiers or QR values. */
  hasStatusValue: boolean
  hasEventValue: boolean
}

const fieldNames: readonly ProviderFieldName[] = [
  'fiscalId', 'fiscalCode', 'fiscalVerificationCode',
  'fiscalQrCodeData', 'revenueAuthorityReference',
]

export interface RecoveryProviderReviewReport {
  countryCode: FiscalCountryCode
  fields: readonly ProviderFieldReview[]
  unresolved: readonly ProviderFieldName[]
  conflicts: readonly ProviderFieldName[]
  mappingReady: false
  receiptCreationAuthorized: false
}

/**
 * Review evidence provenance without recording customer data or assuming
 * that identical values establish a regulatory reference mapping.
 * Explicit provider contract approval is still required.
 */
export function buildRecoveryProviderReview(input: {
  countryCode: FiscalCountryCode
  statusEvidence: InvoiceStatusFiscalEvidence | null | undefined
  linkedEventResponse: unknown
}): RecoveryProviderReviewReport {
  const inventory = inspectRecoveryProviderFields(input)
  const response = input.linkedEventResponse
  const event = response !== null && typeof response === 'object' && !Array.isArray(response)
    ? response as Record<string, unknown> : null
  const fields = fieldNames.map((field): ProviderFieldReview => {
    const statusValue = inventory.fields[field]
    const raw = event?.[field]
    const hasEventValue = raw !== undefined && raw !== null
    const validEventValue = typeof raw === 'string' && raw.trim().length > 0
    let status: ProviderFieldReviewStatus
    if (hasEventValue && !validEventValue) status = 'invalid-event'
    else if (!statusValue && !hasEventValue) status = 'missing'
    else if (!statusValue && validEventValue) status = 'event-only'
    else if (statusValue && !hasEventValue) status = 'status-only'
    else status = statusValue === (raw as string).trim() ? 'matching' : 'conflicting'
    return { field, status, hasStatusValue: statusValue !== null, hasEventValue }
  })
  return {
    countryCode: input.countryCode,
    fields,
    unresolved: fields.filter(item => item.status !== 'matching').map(item => item.field),
    conflicts: fields.filter(item => item.status === 'conflicting' || item.status === 'invalid-event')
      .map(item => item.field),
    mappingReady: false,
    receiptCreationAuthorized: false,
  }
}
