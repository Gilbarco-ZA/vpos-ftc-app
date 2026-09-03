import { logger } from '@/src/shared/utils/logger'

import type { PriceBank, ResolvedPricingCommandDeps } from './contracts'
import { toPriceBank } from './mapping'

const priceBanksMatch = (expected: PriceBank, actual: PriceBank | null) => {
  if (!actual) return false
  return (
    expected.fcPriceSetId === actual.fcPriceSetId &&
    JSON.stringify(expected.fcPriceGroupIds) ===
      JSON.stringify(actual.fcPriceGroupIds) &&
    JSON.stringify(expected.fcGradeIds) === JSON.stringify(actual.fcGradeIds) &&
    JSON.stringify(expected.fcPriceGroups) ===
      JSON.stringify(actual.fcPriceGroups)
  )
}

export async function verifyImmediatePriceChange(params: {
  client: any
  timeoutMs: number
  deps: ResolvedPricingCommandDeps
  expectedBank: PriceBank
  changePriceSetSubCode?: string
  fallbackCurrentPriceSetSubCode?: string
}) {
  let activePriceSet: any = null
  let activePriceSetSubCode: string | undefined
  let activeBank: PriceBank | null = null

  try {
    const activeResult = await params.deps.readCurrentPriceSet(
      params.client,
      params.timeoutMs,
    )
    activePriceSet = activeResult.response
    activePriceSetSubCode = activeResult.usedSubCode
    activeBank = toPriceBank(activePriceSet)
  } catch {
    activePriceSet = null
  }

  const verifiedOnController = priceBanksMatch(params.expectedBank, activeBank)
  if (!verifiedOnController) {
    logger.warn('[jpl]', {
      msg: 'immediate price change accepted without active-bank verification',
      fcPriceSetId: params.expectedBank.fcPriceSetId,
      changePriceSetSubCode: params.changePriceSetSubCode,
      activePriceSetSubCode,
    })
  }

  return {
    activePriceSet,
    verifiedOnController,
    currentPriceSetSubCode:
      activePriceSetSubCode ?? params.fallbackCurrentPriceSetSubCode,
  }
}
