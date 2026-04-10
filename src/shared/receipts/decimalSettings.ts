export type DecimalSettings = {
  money: number
  volume: number
  unitPrice: number
}

export type DecimalSettingsOverrides = Partial<
  Record<keyof DecimalSettings, number | null | undefined>
>

export const DEFAULT_DECIMAL_SETTINGS: DecimalSettings = {
  money: 2,
  volume: 2,
  unitPrice: 2,
}

const clamp = (value: number | null | undefined): number | null => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  const normalized = Math.trunc(value)
  if (normalized < 0 || normalized > 3) return null
  return normalized
}

export const resolveDecimalSettings = (
  overrides?: DecimalSettingsOverrides,
): DecimalSettings => ({
  money: clamp(overrides?.money) ?? DEFAULT_DECIMAL_SETTINGS.money,
  volume: clamp(overrides?.volume) ?? DEFAULT_DECIMAL_SETTINGS.volume,
  unitPrice: clamp(overrides?.unitPrice) ?? DEFAULT_DECIMAL_SETTINGS.unitPrice,
})
