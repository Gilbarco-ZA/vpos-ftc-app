import type { CountryCapabilities, FiscalCountryCode } from './countryAdapter'

export type CountryFunctionStatus = 'planned' | 'implemented' | 'connected' | 'verified'

export interface CountryAdapterDefinition {
  readonly countryCode: FiscalCountryCode
  readonly displayName: string
  readonly currency: string
  readonly timezone: string
  readonly capabilities: Readonly<CountryCapabilities>
  /** Roadmap status only: definitions are not executable fiscal integrations. */
  readonly status: CountryFunctionStatus
  readonly notes: readonly string[]
}
