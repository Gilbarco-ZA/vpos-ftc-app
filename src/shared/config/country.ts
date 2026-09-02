const TANZANIA_COUNTRY_VALUES = new Set([
  'TZ',
  'TZA',
  'TANZANIA',
  'UNITED REPUBLIC OF TANZANIA',
])

export const normalizeCountryValue = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()

export const isTanzaniaCountry = (value: unknown) =>
  TANZANIA_COUNTRY_VALUES.has(normalizeCountryValue(value))
