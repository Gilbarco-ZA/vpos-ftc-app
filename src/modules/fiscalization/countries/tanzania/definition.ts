import type { CountryAdapterDefinition } from '../../domain/countryDefinition'

/** Descriptive configuration only; not yet a runtime integration. */
export const tanzaniaAdapterDefinition: CountryAdapterDefinition = {
  countryCode: 'TZ',
  displayName: 'Tanzania',
  currency: 'TZS',
  timezone: 'Africa/Dar_es_Salaam',
  status: 'planned',
  capabilities: {
    invoiceSubmission: true,
    creditNotes: true,
    productRegistration: true,
    productStatus: true,
    invoiceStatus: true,
    receiptRendering: true,
    dailyTotals: true,
    tankInventory: true,
    fiscalCounters: true,
  },
  notes: [
    'Preserve TRA receipt counters and Tanzania fiscal metadata.',
    'Tank validation, ATG and no-ATG handling must retain existing behavior.',
    'Status recovery must remain idempotent and correlation-aware.',
  ],
}
