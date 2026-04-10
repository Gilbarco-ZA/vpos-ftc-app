export const getConfiguredCurrencyOptions = () => {
  return String(process.env.CURRENCY_OPTIONS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export const isProductDevOverridesEnabled = () => {
  return process.env.NODE_ENV !== 'production'
}
