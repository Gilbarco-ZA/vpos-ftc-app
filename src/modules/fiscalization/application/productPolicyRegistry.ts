import { kenyaProductPolicy } from '../countries/kenya/productPolicy'
import { tanzaniaProductPolicy } from '../countries/tanzania/productPolicy'
import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { ProductPolicy } from '../domain/productPolicy'
import { normalizeRegisteredCountry } from './countryRegistry'

const policies: ReadonlyMap<FiscalCountryCode, ProductPolicy> = new Map([
  ['KE', kenyaProductPolicy],
  ['TZ', tanzaniaProductPolicy],
])

/** Explicitly opt-in for tests; not imported by production workflows. */
export function getCountryProductPolicy(country: unknown): ProductPolicy {
  const code = normalizeRegisteredCountry(country)
  const policy = policies.get(code)
  if (!policy) throw new Error(`Product policy not configured for ${code}`)
  return policy
}
