import type { FiscalCountryCode } from '../domain/countryAdapter'
import { normalizeRegisteredCountry } from './countryRegistry'
import type { FiscalStatusLookupResult } from './statusRecoveryService'

/**
 * Derived from cloud-swagger.json and tanzania-swagger.json (Oct 2026).
 * This module prepares requests and interprets collections; it performs no I/O.
 */
export interface InvoiceStatusEndpoint {
  method: 'GET'
  path: string
  query: { DocumentId: string }
}

export function buildInvoiceStatusEndpoint(country: unknown, documentId: string): InvoiceStatusEndpoint {
  const code: FiscalCountryCode = normalizeRegisteredCountry(country)
  const id = documentId.trim()
  if (!id) throw new Error('Document ID is required')
  return {
    method: 'GET',
    path: code === 'TZ' ? '/api/tanzania/invoices/status' : '/api/invoices/status',
    query: { DocumentId: id },
  }
}

type StatusRow = {
  documentId?: string | null
  status?: string | null
  error?: boolean
  message?: string | null
}

export interface SwaggerInvoiceStatusCollection {
  error?: boolean
  responseCode?: string | null
  message?: string | null
  invoices?: StatusRow[] | null
}

/**
 * Fail closed for empty, ambiguous or contradictory collections.
 * Status rows have no details.isFiscalized field; status is passed through
 * and interpreted by the existing normalization/reconciliation guard.
 */
export function parseInvoiceStatusCollection(
  documentId: string,
  payload: unknown,
): FiscalStatusLookupResult {
  const id = documentId.trim()
  if (!id) throw new Error('Document ID is required')
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { kind: 'unavailable', reason: 'Invalid invoice status collection' }
  }
  const data = payload as SwaggerInvoiceStatusCollection
  if (data.error === true) {
    return { kind: 'unavailable', reason: data.message || 'Proxy invoice status query failed' }
  }
  if (!Array.isArray(data.invoices)) {
    return { kind: 'unavailable', reason: 'Invoice status collection does not contain invoices' }
  }
  const matches = data.invoices.filter(row =>
    row !== null && typeof row === 'object' && row.documentId === id,
  )
  if (matches.length !== 1) {
    return { kind: 'unavailable', reason: matches.length === 0
      ? 'No matching invoice status returned'
      : 'Ambiguous invoice status: multiple matching documents' }
  }
  const match = matches[0]
  if (!match || typeof match.status !== 'string' || !match.status.trim()) {
    return { kind: 'unavailable', reason: 'Matching invoice has no status' }
  }
  if (match.error === true) {
    return { kind: 'unavailable', reason: match.message || 'Matching invoice status reports an error' }
  }
  return {
    kind: 'response',
    response: { error: false, documentId: id, status: match.status },
  }
}
