import type { CountryFiscalizationAdapter } from '../domain/countryAdapter'
import type { CountryAdapterDefinition } from '../domain/countryDefinition'
import type { ProductPolicy } from '../domain/productPolicy'
import type { InvoicePolicy } from '../domain/invoicePolicy'
import type { CreditNotePolicy } from '../domain/creditNotePolicy'
import type { ReceiptPolicy } from '../domain/receiptPolicy'

import { getCountryDefinition, normalizeRegisteredCountry } from './countryRegistry'
import { getCountryProductPolicy } from './productPolicyRegistry'
import { getCountryInvoicePolicy } from './invoicePolicyRegistry'
import { getCountryCreditNotePolicy } from './creditNotePolicyRegistry'
import { getCountryReceiptPolicy } from './receiptPolicyRegistry'
import { getCountryStatusNormalizer } from './statusPolicyRegistry'

export type FiscalLayerOperation = 'products' | 'invoices' | 'creditNotes' | 'receipts' | 'status'

/** A registered test policy is NOT evidence of a verified or production-ready API. */
export interface CountryFiscalLayer extends CountryFiscalizationAdapter {
  readonly definition: CountryAdapterDefinition
}

/**
 * Explicitly construct test policies without mutating the production countryAdapterRegistry.
 * Capability declarations describe country services; they do not imply tested execution.
 */
export function createCountryFiscalLayer(country: unknown): CountryFiscalLayer {
  const countryCode = normalizeRegisteredCountry(country)
  const definition = getCountryDefinition(countryCode)
  const receipt = getCountryReceiptPolicy(countryCode)
  if (receipt.countryCode !== countryCode) {
    throw new Error('Receipt policy country mismatch: ' + countryCode)
  }
  return Object.freeze({
    countryCode,
    definition,
    capabilities: definition.capabilities,
    products: getCountryProductPolicy(countryCode),
    invoices: getCountryInvoicePolicy(countryCode),
    creditNotes: getCountryCreditNotePolicy(countryCode),
    receipts: receipt,
    normalizeStatus: getCountryStatusNormalizer(countryCode),
    productionConnected: false as const,
  })
}

/** Narrow, test-only resolver for callers that opt in to this module. */
export function getFiscalLayerPolicy(
  country: unknown,
  operation: FiscalLayerOperation,
): ProductPolicy | InvoicePolicy | CreditNotePolicy | ReceiptPolicy |
  CountryFiscalLayer['normalizeStatus'] {
  const layer = createCountryFiscalLayer(country)
  switch (operation) {
    case 'products': return layer.products
    case 'invoices': return layer.invoices
    case 'creditNotes': return layer.creditNotes
    case 'receipts': return layer.receipts
    case 'status': return layer.normalizeStatus
  }
}

/** Guard used by integration tests; not a production feature switch. */
export function assertFiscalLayerNotLive(layer: CountryFiscalLayer): void {
  if (layer.productionConnected !== false) {
    throw new Error('Country fiscal layer unexpectedly marked as connected')
  }
}
