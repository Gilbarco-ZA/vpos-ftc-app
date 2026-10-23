import type {
  CountryFiscalizationAdapter,
  FiscalCountryCode,
} from '../domain/countryAdapter'
import { kenyaAdapterDefinition } from '../countries/kenya/definition'
import { tanzaniaAdapterDefinition } from '../countries/tanzania/definition'
import type { CountryAdapterDefinition } from '../domain/countryDefinition'

const definitions: ReadonlyMap<FiscalCountryCode, CountryAdapterDefinition> =
  new Map([
    ['KE', kenyaAdapterDefinition],
    ['TZ', tanzaniaAdapterDefinition],
  ])

const aliases: Readonly<Record<string, FiscalCountryCode>> = {
  KE: 'KE',
  KEN: 'KE',
  KENYA: 'KE',
  'REPUBLIC OF KENYA': 'KE',
  TZ: 'TZ',
  TZA: 'TZ',
  TANZANIA: 'TZ',
  'UNITED REPUBLIC OF TANZANIA': 'TZ',
}

/** Unknown country is an explicit error, never a legacy/Tanzania fallback. */
export function normalizeRegisteredCountry(value: unknown): FiscalCountryCode {
  const code = aliases[String(value ?? '').trim().toUpperCase()]
  if (!code) throw new Error(`Unsupported fiscalization country: ${String(value ?? '')}`)
  return code
}

export function listCountryDefinitions(): CountryAdapterDefinition[] {
  return [...definitions.values()]
}

export function getCountryDefinition(value: unknown): CountryAdapterDefinition {
  const code = normalizeRegisteredCountry(value)
  const definition = definitions.get(code)
  if (!definition) throw new Error(`Missing fiscalization country definition: ${code}`)
  return definition
}

/**
 * Register a future full implementation without activating it in production.
 * Registry lookup remains opt-in; no existing worker or route uses it.
 */
export class CountryAdapterRegistry {
  private readonly adapters = new Map<FiscalCountryCode, CountryFiscalizationAdapter>()

  register(adapter: CountryFiscalizationAdapter): void {
    const definition = getCountryDefinition(adapter.countryCode)
    if (this.adapters.has(definition.countryCode)) {
      throw new Error(`Country adapter already registered: ${definition.countryCode}`)
    }
    this.adapters.set(definition.countryCode, adapter)
  }

  resolve(value: unknown): CountryFiscalizationAdapter {
    const code = normalizeRegisteredCountry(value)
    const adapter = this.adapters.get(code)
    if (!adapter) throw new Error(`Fiscalization adapter not connected: ${code}`)
    return adapter
  }

  available(): readonly FiscalCountryCode[] {
    return [...this.adapters.keys()]
  }
}

/** Intentionally has no runtime adapter registrations until integration phase. */
export const countryFiscalizationRegistry = new CountryAdapterRegistry()
