/** Only an invoice's own terminal status can complete reconciliation. */
export type ProxyInvoiceOutcome = 'approved' | 'failed' | 'pending'

export function classifyProxyInvoiceStatus(
  value: unknown,
): ProxyInvoiceOutcome {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'pending'
  }
  const invoice = value as Record<string, unknown>
  if (invoice.error === true) return 'pending'
  const status = String(invoice.status ?? '').trim().toUpperCase()
  if (['APPROVED', 'FISCALIZED', 'COMPLETED'].includes(status)) return 'approved'
  if (['FAILED', 'REJECTED', 'DECLINED'].includes(status)) return 'failed'
  return 'pending'
}

/** Preserve the Kenya-specific API used by existing tests and callers. */
export type KenyaProxyInvoiceOutcome = ProxyInvoiceOutcome
export const classifyKenyaProxyInvoiceStatus = classifyProxyInvoiceStatus
