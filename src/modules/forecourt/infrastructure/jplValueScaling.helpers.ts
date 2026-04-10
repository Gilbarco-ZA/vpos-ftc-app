export const normKey = (countryCode: string) =>
  String(countryCode || '')
    .trim()
    .toUpperCase()

export const isIntLike = (n: number) =>
  Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9

export const isZeroPaddedDigits = (raw: unknown) => {
  if (typeof raw !== 'string') return false
  const s = raw.trim()
  if (!/^\d+$/.test(s)) return false
  if (s.length <= 1) return false
  return s.startsWith('0')
}

export function heuristicDivisor(
  raw: number,
  kind: 'money' | 'volume',
): number {
  if (!Number.isFinite(raw)) return 1
  if (!isIntLike(raw)) return 1

  if (kind === 'money') {
    return raw >= 100 ? 100 : 1
  }

  return raw >= 100 ? 100 : 1
}
