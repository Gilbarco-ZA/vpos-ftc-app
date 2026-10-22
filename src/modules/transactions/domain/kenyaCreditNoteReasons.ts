export const KENYA_CREDIT_NOTE_REASONS = [
  { code: '01', description: 'Missing Quantity' },
  { code: '02', description: 'Missing Item' },
  { code: '03', description: 'Damaged' },
  { code: '04', description: 'Wasted' },
  { code: '05', description: 'Raw Material Shortage' },
  { code: '06', description: 'Refund' },
  { code: '07', description: 'Wrong Customer PIN' },
  { code: '08', description: 'Wrong Customer Name' },
  { code: '09', description: 'Wrong Amount/Price' },
  { code: '10', description: 'Wrong Quantity' },
  { code: '11', description: 'Wrong Item(s)' },
  { code: '12', description: 'Wrong Tax Type' },
  { code: '13', description: 'Other' },
] as const

export function isKenyaCreditNoteReasonCode(value: string): boolean {
  return KENYA_CREDIT_NOTE_REASONS.some((reason) => reason.code === value)
}
