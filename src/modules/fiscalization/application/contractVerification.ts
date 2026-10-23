import type { ProxyInvoiceRequest } from '@/src/shared/fiscalization/proxy/contracts'
import { toCountrySpecificInvoicePayload } from '@/src/modules/transactions/infrastructure/fiscalization/transaction-proxy.payload'
import { serializeFiscalProxyInvoiceForComparison } from './proxyInvoiceParity'
import { normalizeRegisteredCountry } from './countryRegistry'
import type { FiscalCountryCode } from '../domain/countryAdapter'

export interface ContractDifference {
  path: string
  existing: unknown
  candidate: unknown
}
export interface ContractComparison {
  countryCode: FiscalCountryCode
  matches: boolean
  differences: readonly ContractDifference[]
  /** Comparing two local serializers does not establish remote API acceptance. */
  remoteContractVerified: false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function compareValues(a: unknown, b: unknown, path: string, out: ContractDifference[]): void {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      out.push({ path, existing: a, candidate: b })
      return
    }
    a.forEach((item, index) => compareValues(item, b[index], path + '[' + index + ']', out))
    return
  }
  if (isRecord(a) && isRecord(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const segment = path ? path + '.' + key : key
      if (!(key in a) || !(key in b)) {
        out.push({ path: segment, existing: a[key], candidate: b[key] })
      } else {
        compareValues(a[key], b[key], segment, out)
      }
    }
    return
  }
  if (!Object.is(a, b)) out.push({ path: path || '$', existing: a, candidate: b })
}

/** Compare arbitrary wire payloads, including intentionally divergent test fixtures. */
export function findContractDifferences(existing: unknown, candidate: unknown): ContractDifference[] {
  const differences: ContractDifference[] = []
  compareValues(existing, candidate, '', differences)
  return differences
}

/** Pure, deterministic local wire-shape comparison. Never sends requests. */
export function compareProxyInvoiceContracts(
  country: unknown,
  invoice: ProxyInvoiceRequest,
): ContractComparison {
  const countryCode = normalizeRegisteredCountry(country)
  const existing = toCountrySpecificInvoicePayload({ ...invoice, countryCode })
  const candidate = serializeFiscalProxyInvoiceForComparison(countryCode, invoice)
  const differences = findContractDifferences(existing, candidate)
  return {
    countryCode,
    matches: differences.length === 0,
    differences,
    remoteContractVerified: false,
  }
}
