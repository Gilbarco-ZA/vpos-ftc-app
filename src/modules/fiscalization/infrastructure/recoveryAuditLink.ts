/**
 * Testable transaction-local audit and compatibility-link operation.
 * The caller must supply operations using the SAME database transaction.
 */
export interface RecoveryAuditInput {
  stationId: string
  transactionId: string
  documentId: string
  idempotencyKey: string
  observedStatus: string
}
export interface RecoveryAuditOperations {
  persist(input: RecoveryAuditInput): Promise<{ eventId: string; summary: unknown }>
  link(input: RecoveryAuditInput & { eventId: string; summary: unknown }): Promise<number>
}
export async function persistAndLinkRecoveryAudit(
  operations: RecoveryAuditOperations,
  input: RecoveryAuditInput,
): Promise<void> {
  if (!input.stationId.trim() || !input.transactionId.trim() ||
    !input.documentId.trim() || !input.idempotencyKey.trim() ||
    !input.observedStatus.trim()) {
    throw new Error('Recovery audit identity and evidence required')
  }
  const recorded = await operations.persist(input)
  if (!recorded.eventId.trim()) throw new Error('Recovery fiscal event identity missing')
  const updated = await operations.link({ ...input, ...recorded })
  if (updated !== 1) throw new Error('Recovery audit summary could not be bound to transaction')
}
