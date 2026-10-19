import type { ValidationResult } from '../../domain/countryAdapter'
import type { CreditNotePolicy } from '../../domain/creditNotePolicy'
import { validateCreditNoteCore } from '../../domain/creditNotePolicy'

/**
 * Tanzania credit notes need confirmed fiscal counter/reference semantics.
 * Fail closed instead of issuing an unverified TRA reversal.
 */
export const tanzaniaCreditNotePolicy: CreditNotePolicy = {
  validate(note): ValidationResult {
    const issues = validateCreditNoteCore(note)
    if (note.invoice.currency.toUpperCase() !== 'TZS') {
      issues.push({ field: 'invoice.currency', message: 'Tanzania credit notes require TZS' })
    }
    issues.push({
      field: 'tanzania.fiscalCreditNote',
      message: 'Tanzania fiscal credit-note contract is not yet verified for the new layer',
    })
    return { valid: false, issues }
  },
  buildPayload(): never {
    throw new Error('Tanzania fiscal credit-note serialization is not yet verified; existing production path must remain in use')
  },
}
