import type { FiscalCountryCode } from '../domain/countryAdapter'
import { normalizeRegisteredCountry } from './countryRegistry'
import { normalizeInvoiceFiscalStatus } from '../domain/statusPolicy'

/** Resolution only: does not issue HTTP requests, mutate transactions, or retry. */
export function getCountryStatusNormalizer(country: unknown): typeof normalizeInvoiceFiscalStatus {
  const code: FiscalCountryCode = normalizeRegisteredCountry(country)
  switch (code) {
    case 'KE':
    case 'TZ':
      return normalizeInvoiceFiscalStatus
  }
}
