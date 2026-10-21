/** Kenya KRA PIN format: A/P, nine digits, and a trailing letter. */
export const KENYA_PIN_PATTERN = /^[AP]\d{9}[A-Z]$/

export function isValidKenyaPin(value: unknown): boolean {
  return KENYA_PIN_PATTERN.test(String(value ?? '').trim().toUpperCase())
}
