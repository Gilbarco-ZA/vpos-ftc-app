import type { CountryAdapterDefinition } from '../../domain/countryDefinition'

/** Descriptive configuration only; not yet a runtime integration. */
export const kenyaAdapterDefinition: CountryAdapterDefinition = {
  countryCode: 'KE',
  displayName: 'Kenya',
  currency: 'KES',
  timezone: 'Africa/Nairobi',
  status: 'planned',
  capabilities: {
    invoiceSubmission: true,
    creditNotes: true,
    productRegistration: true,
    productStatus: true,
    invoiceStatus: false, // requires endpoint verification before enabling
    receiptRendering: true,
    dailyTotals: false,
    tankInventory: false,
    fiscalCounters: false,
  },
  notes: [
    'Existing invoice mapper uses DocumentId, Lines, Currency and Payment.Tenders.',
    'Products register in a products[] batch; validate type 1/2/3 and tax A/B/C/D/E.',
    'Proxy endpoints and receipt/status contract must be confirmed at migration time.',
  ],
}
