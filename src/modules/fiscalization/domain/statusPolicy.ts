import type { FiscalProcessingState } from './countryAdapter'
import type { ProxyInvoiceResponse } from '@/src/shared/fiscalization/proxy/contracts'

export interface FiscalStatusResolution {
  state: FiscalProcessingState
  documentId: string | null
  sourceStatus: string | null
  reason: string
  /** Unknown/pending results must not be interpreted as permission to submit again. */
  safeToResubmit: false
}

const SUCCESS = new Set(['FISCALIZED', 'FISCALISED', 'SUCCESS', 'COMPLETED'])
const PENDING = new Set(['PENDING', 'FISCALIZING', 'FISCALISING', 'PROCESSING', 'IN_PROGRESS'])
const FAILED = new Set(['FAILED', 'REJECTED', 'ERROR'])

export function normalizeInvoiceFiscalStatus(
  response: ProxyInvoiceResponse,
): FiscalStatusResolution {
  const raw = String(response.status ?? '').trim().toUpperCase()
  const isFiscalized = response.details?.isFiscalized === true
  // An explicit fiscalization confirmation wins over transient top-level errors.
  if (isFiscalized || SUCCESS.has(raw)) {
    return {
      state: 'fiscalized',
      documentId: response.documentId ?? null,
      sourceStatus: raw || null,
      reason: 'Fiscalization confirmed by proxy',
      safeToResubmit: false,
    }
  }
  if (PENDING.has(raw)) {
    return {
      state: 'processing',
      documentId: response.documentId ?? null,
      sourceStatus: raw,
      reason: 'Fiscalization outcome remains unresolved',
      safeToResubmit: false,
    }
  }
  if (FAILED.has(raw) || response.error) {
    return {
      state: 'failed',
      documentId: response.documentId ?? null,
      sourceStatus: raw || null,
      reason: 'Proxy reported an error or rejection; investigate before retry',
      safeToResubmit: false,
    }
  }
  return {
    state: 'unknown',
    documentId: response.documentId ?? null,
    sourceStatus: raw || null,
    reason: 'Status is not recognized; check the original document with the proxy',
    safeToResubmit: false,
  }
}
