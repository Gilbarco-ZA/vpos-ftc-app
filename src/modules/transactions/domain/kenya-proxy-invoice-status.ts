/** Kenya invoice status responses are authoritative only for terminal states. */
export type KenyaProxyInvoiceOutcome = 'approved' | 'failed' | 'pending'

export function classifyKenyaProxyInvoiceStatus(
  value: unknown,
): KenyaProxyInvoiceOutcome {
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
