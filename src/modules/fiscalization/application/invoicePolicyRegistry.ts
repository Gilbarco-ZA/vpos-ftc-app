import { kenyaInvoicePolicy } from '../countries/kenya/invoicePolicy'
import { tanzaniaInvoicePolicy } from '../countries/tanzania/invoicePolicy'
import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { InvoicePolicy } from '../domain/invoicePolicy'
import { normalizeRegisteredCountry } from './countryRegistry'

const policies: ReadonlyMap<FiscalCountryCode, InvoicePolicy> = new Map([
  ['KE', kenyaInvoicePolicy],
  ['TZ', tanzaniaInvoicePolicy],
])

/** Testing-only opt-in resolver. Production sender and routes remain untouched. */
export function getCountryInvoicePolicy(country: unknown): InvoicePolicy {
  const code = normalizeRegisteredCountry(country)
  const policy = policies.get(code)
  if (!policy) throw new Error(`Invoice policy not configured for ${code}`)
  return policy
}
