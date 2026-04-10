export function scaleJplMoney(
  raw: unknown,
  _countryCode: string,
  moneyDecimals?: number,
): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null

  const decimals =
    typeof moneyDecimals === 'number' &&
    Number.isInteger(moneyDecimals) &&
    moneyDecimals >= 0 &&
    moneyDecimals <= 4
      ? moneyDecimals
      : 2

  const div = Math.pow(10, decimals)
  const scaled = n / div

  return Number(scaled.toFixed(decimals))
}

export function scaleJplVolume(
  raw: unknown,
  _countryCode: string,
  volumeDecimals?: number,
): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null

  const decimals =
    typeof volumeDecimals === 'number' &&
    Number.isInteger(volumeDecimals) &&
    volumeDecimals >= 0 &&
    volumeDecimals <= 4
      ? volumeDecimals
      : 2

  const div = Math.pow(10, decimals)
  const scaled = n / div

  return Number(scaled.toFixed(decimals))
}
