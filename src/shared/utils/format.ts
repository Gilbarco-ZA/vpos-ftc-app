/**
 * Format a number to a fixed number of decimal digits.
 * Returns '—' for null, undefined, or NaN values.
 */
export const formatNumber = (
  value: number | null | undefined,
  digits = 2,
): string => {
  if (value == null || Number.isNaN(value)) return '—'
  return Number(value).toFixed(digits)
}
