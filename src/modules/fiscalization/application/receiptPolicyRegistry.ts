import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { ReceiptPolicy } from '../domain/receiptPolicy'
import { kenyaReceiptPolicy } from '../countries/kenya/receiptPolicy'
import { tanzaniaReceiptPolicy } from '../countries/tanzania/receiptPolicy'
import { normalizeRegisteredCountry } from './countryRegistry'

const policies: ReadonlyMap<FiscalCountryCode, ReceiptPolicy> = new Map([
  ['KE', kenyaReceiptPolicy],
  ['TZ', tanzaniaReceiptPolicy],
])

/** Opt-in only; existing receiptBuilder remains the production caller. */
export function getCountryReceiptPolicy(country: unknown): ReceiptPolicy {
  const code = normalizeRegisteredCountry(country)
  const policy = policies.get(code)
  if (!policy) throw new Error('Receipt policy unavailable for ' + code)
  return policy
}
