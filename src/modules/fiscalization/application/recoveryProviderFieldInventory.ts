import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { InvoiceStatusFiscalEvidence } from './invoiceStatusFiscalEvidence'

export interface RecoveryProviderFieldInventory {
  countryCode: FiscalCountryCode
  fields: InvoiceStatusFiscalEvidence
  referenceMappingApproved: false
  missingFields: readonly string[]
  conflicts: readonly string[]
}

const fieldNames = [
  'fiscalId', 'fiscalCode', 'fiscalVerificationCode',
  'fiscalQrCodeData', 'revenueAuthorityReference',
] as const

/**
 * A lossless inventory, NOT an authorization to assign a fiscal reference.
 * KE/TZ status response field semantics must be confirmed with live redacted
 * provider samples before promoting any field to transaction/event reference.
 */
export function inspectRecoveryProviderFields(input: {
  countryCode: FiscalCountryCode
  statusEvidence: InvoiceStatusFiscalEvidence | null | undefined
  linkedEventResponse: unknown
}): RecoveryProviderFieldInventory {
  const fields: InvoiceStatusFiscalEvidence = {
    fiscalId: null, fiscalCode: null, fiscalVerificationCode: null,
    fiscalQrCodeData: null, revenueAuthorityReference: null,
  }
  const missingFields: string[] = []
  const conflicts: string[] = []

  const response = input.linkedEventResponse
  // Status and event payloads are not interchangeable. Only compare exact
  // named fields at the response root; never infer meaning from aliases.
  const event = response && typeof response === 'object' && !Array.isArray(response)
    ? response as Record<string, unknown> : null

  for (const name of fieldNames) {
    const statusValue = input.statusEvidence?.[name] ?? null
    fields[name] = statusValue
    if (statusValue === null) missingFields.push(name)
    if (!event || !(name in event) || event[name] == null) continue
    const eventValue = event[name]
    if (typeof eventValue !== 'string' || !eventValue.trim() ||
      (statusValue !== null && statusValue !== eventValue.trim())) {
      conflicts.push(name)
    }
  }

  return {
    countryCode: input.countryCode,
    fields,
    referenceMappingApproved: false,
    missingFields,
    conflicts,
  }
}
