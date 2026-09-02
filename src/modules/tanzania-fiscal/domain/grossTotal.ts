const toFiniteAmount = (value: unknown, label: string): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${label} must be a finite number.`)
  }
  return parsed
}

export function calculateTanzaniaGrossTotal(
  openingGrossTotal: unknown,
  localFiscalTurnover: unknown,
): number {
  const opening = toFiniteAmount(openingGrossTotal, 'Opening gross total')
  const turnover = toFiniteAmount(localFiscalTurnover, 'Local fiscal turnover')
  return Number((opening + turnover).toFixed(2))
}
