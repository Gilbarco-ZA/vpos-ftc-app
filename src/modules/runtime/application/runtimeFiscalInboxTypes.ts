export const fiscalInboxActions = [
  'REQUEUE',
  'CLONE_REQUEUE',
  'MARK_DEAD',
  'MARK_FAILED',
  'MARK_PROCESSED',
  'DELETE',
] as const

export type RuntimeFiscalInboxAction = (typeof fiscalInboxActions)[number]

export type RuntimeFiscalInboxMutationInput = {
  action: RuntimeFiscalInboxAction
  errorText?: string | null
  requestId?: string | null
  messageJson?: unknown
}
