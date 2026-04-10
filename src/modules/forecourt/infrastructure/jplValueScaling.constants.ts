export type JplScale = {
  moneyDivisor: number
  volumeDivisor: number
}

// Explicit country mapping is preferred; unknown codes use guarded heuristics.
export const SCALE_BY_COUNTRY: Record<string, JplScale> = {
  KE: { moneyDivisor: 100, volumeDivisor: 100 },
  TZ: { moneyDivisor: 100, volumeDivisor: 100 },
  UG: { moneyDivisor: 100, volumeDivisor: 100 },
  ZA: { moneyDivisor: 100, volumeDivisor: 100 },

  '254': { moneyDivisor: 100, volumeDivisor: 100 },
  '255': { moneyDivisor: 100, volumeDivisor: 100 },
  '256': { moneyDivisor: 100, volumeDivisor: 100 },
  '27': { moneyDivisor: 100, volumeDivisor: 100 },
}
