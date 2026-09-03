import { logger } from '@/src/shared/utils/logger'

import type { PriceBank, ResolvedPricingCommandDeps } from './contracts'
import { toPriceBank } from './mapping'

const VERIFY_ATTEMPTS = 3
const VERIFY_RETRY_DELAY_MS = 150

const wait = async (ms: number) =>
  await new Promise<void>((resolve) => setTimeout(resolve, ms))

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

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error ?? '')

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
  let verificationError: string | undefined
  let verificationAttempts = 0

  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
    verificationAttempts = attempt
    try {
      const activeResult = await params.deps.readCurrentPriceSet(
        params.client,
        params.timeoutMs,
      )
      activePriceSet = activeResult.response
      activePriceSetSubCode = activeResult.usedSubCode
      verificationError = undefined

      if (priceBanksMatch(params.expectedBank, toPriceBank(activePriceSet))) {
        return {
          activePriceSet,
          verifiedOnController: true,
          verificationAttempts,
          verificationError,
          currentPriceSetSubCode:
            activePriceSetSubCode ?? params.fallbackCurrentPriceSetSubCode,
        }
      }
    } catch (error) {
      activePriceSet = null
      verificationError = errorMessage(error) || 'Unable to read active price bank'
    }

    if (attempt < VERIFY_ATTEMPTS) {
      await wait(VERIFY_RETRY_DELAY_MS)
    }
  }

  logger.warn('[jpl]', {
    msg: 'immediate price change accepted without active-bank verification',
    fcPriceSetId: params.expectedBank.fcPriceSetId,
    changePriceSetSubCode: params.changePriceSetSubCode,
    activePriceSetSubCode,
    verificationAttempts,
    verificationError,
  })

  return {
    activePriceSet,
    verifiedOnController: false,
    verificationAttempts,
    verificationError,
    currentPriceSetSubCode:
      activePriceSetSubCode ?? params.fallbackCurrentPriceSetSubCode,
  }
}
