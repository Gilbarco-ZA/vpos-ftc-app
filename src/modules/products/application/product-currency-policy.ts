export const resolveDefaultProductCurrency = (args: {
  stationCurrency?: string | null
  configuredOptions?: string[]
  environmentDefault?: string | null
}) => {
  const stationCurrency = String(args.stationCurrency || '').trim()
  if (stationCurrency) return stationCurrency

  const configuredCurrency =
    args.configuredOptions?.map((value) => value.trim()).find(Boolean) ?? ''
  if (configuredCurrency) return configuredCurrency

  return String(args.environmentDefault || '').trim() || 'USD'
}
