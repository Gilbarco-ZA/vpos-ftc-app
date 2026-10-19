import type { FiscalCountryCode } from '../domain/countryAdapter'
import { createCountryFiscalLayer } from './countryFiscalLayer'

export type FiscalFeature = 'products' | 'invoices' | 'creditNotes' | 'receipts' | 'status'
export type ReadinessStage = 'not-implemented' | 'implemented-unverified' | 'contract-verified' | 'production-connected'

export interface FiscalFeatureReadiness {
  feature: FiscalFeature
  stage: ReadinessStage
  blockers: readonly string[]
}

export interface FiscalCountryReadiness {
  countryCode: FiscalCountryCode
  productionConnected: false
  readyForProduction: false
  features: readonly FiscalFeatureReadiness[]
}

/**
 * Conservative, explicit roadmap assessment. Tests or implementation presence
 * alone cannot promote a feature to "contract-verified".
 */
const featureBlockers: Readonly<Record<FiscalCountryCode, Readonly<Record<FiscalFeature, readonly string[]>>>> = {
  KE: {
    products: ['Confirm class codes, fuel defaults and batch acceptance against the current proxy contract'],
    invoices: ['Verify tender and invoice payload parity with production fixtures'],
    creditNotes: ['Verify reversal sign and document reference semantics with Kenya API'],
    receipts: ['Snapshot-test enriched fiscal receipt models'],
    status: ['Confirm Kenya invoice status endpoint and response code contract'],
  },
  TZ: {
    products: ['Compare per-product serializer with the actual Tanzania proxy registration contract'],
    invoices: ['Verify unit-price semantics, tax totals and fiscal enrichment with production fixtures'],
    creditNotes: ['Tanzania fiscal credit-note payload and counter rules are not verified'],
    receipts: ['Snapshot-test receipt model including TRA counters, QR and signature'],
    status: ['Verify Tanzania status endpoint, error variants and document correlation'],
  },
}

export function assessFiscalLayerReadiness(country: unknown): FiscalCountryReadiness {
  const layer = createCountryFiscalLayer(country)
  const countryCode = layer.countryCode
  const features = (Object.keys(featureBlockers[countryCode]) as FiscalFeature[]).map(feature => ({
    feature,
    stage: feature === 'creditNotes' && countryCode === 'TZ'
      ? 'not-implemented' as const
      : 'implemented-unverified' as const,
    blockers: featureBlockers[countryCode][feature],
  }))
  return {
    countryCode,
    productionConnected: false,
    readyForProduction: false,
    features,
  }
}
