import type { CanonicalInvoice, ValidationIssue, ValidationResult } from './countryAdapter'

export interface CanonicalCreditNote {
  creditNoteId: string
  originalDocumentId: string
  issuedAt: string
  reasonCode: string
  reason: string
  createdByName: string
  isOnline: boolean
  /** Lines are original positive quantities; reversal semantics belong to the provider contract. */
  invoice: CanonicalInvoice
  documentNumber?: string
}

export interface CreditNotePolicy {
  validate(note: CanonicalCreditNote): ValidationResult
  buildPayload(note: CanonicalCreditNote): unknown
}

export function validateCreditNoteCore(note: CanonicalCreditNote): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const [field, value] of [
    ['creditNoteId', note.creditNoteId],
    ['originalDocumentId', note.originalDocumentId],
    ['reasonCode', note.reasonCode],
    ['createdByName', note.createdByName],
  ] as const) {
    if (!value.trim()) issues.push({ field, message: 'Required credit note field is empty' })
  }
  if (note.creditNoteId.trim() === note.originalDocumentId.trim()) {
    issues.push({ field: 'creditNoteId', message: 'Credit note ID must differ from original document ID' })
  }
  if (!note.invoice.lines.length) issues.push({ field: 'invoice.lines', message: 'Credit note must have at least one line' })
  if (!note.issuedAt.trim() || Number.isNaN(Date.parse(note.issuedAt))) {
    issues.push({ field: 'issuedAt', message: 'Valid issue date required' })
  }
  return issues
}

export function requireValidCreditNote(policy: CreditNotePolicy, note: CanonicalCreditNote): void {
  const validation = policy.validate(note)
  if (!validation.valid) throw new Error(validation.issues.map(issue => issue.field + ': ' + issue.message).join('; '))
}
