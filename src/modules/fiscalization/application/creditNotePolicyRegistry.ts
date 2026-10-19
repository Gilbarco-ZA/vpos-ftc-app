import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { CreditNotePolicy } from '../domain/creditNotePolicy'
import { normalizeRegisteredCountry } from './countryRegistry'
import { kenyaCreditNotePolicy } from '../countries/kenya/creditNotePolicy'
import { tanzaniaCreditNotePolicy } from '../countries/tanzania/creditNotePolicy'

const policies: ReadonlyMap<FiscalCountryCode, CreditNotePolicy> = new Map([
  ['KE', kenyaCreditNotePolicy],
  ['TZ', tanzaniaCreditNotePolicy],
])

/** Explicit opt-in only. No production credit-note route uses this registry. */
export function getCountryCreditNotePolicy(country: unknown): CreditNotePolicy {
  const code = normalizeRegisteredCountry(country)
  const policy = policies.get(code)
  if (!policy) throw new Error('Credit-note policy not configured for ' + code)
  return policy
}
