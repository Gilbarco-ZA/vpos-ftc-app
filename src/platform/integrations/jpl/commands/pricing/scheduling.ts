import type { JplCommandContext } from '@/src/platform/integrations/jpl/commands/contracts'

import { logger } from '@/src/shared/utils/logger'

import type { PriceBank, ResolvedPricingCommandDeps } from './contracts'
import {
  extractEntries,
  extractExplicitPriceBank,
  extractPendingPriceSets,
  mergePriceBank,
  toFcDateTime,
  toId2String,
  toPriceBank,
  ZERO_FC_DATE_TIME,
} from './mapping'

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

export async function handleClearPendingPriceSet(
  context: JplCommandContext,
  deps: ResolvedPricingCommandDeps,
) {
  const { client, cmd, timeoutMs } = context
  const payload = ((cmd as any).payload ?? {}) as Record<string, unknown>
  const fcPriceSetId = toId2String(
    payload.fcPriceSetId ?? payload.FcPriceSetId ?? payload.priceSetId,
    '00',
  )
  const activationAt = toFcDateTime(
    payload.activationAt ??
      payload.priceSetActivationDateAndTime ??
      payload.PriceSetActivationDateAndTime,
  )
  const responseResult = await deps.clearPendingPriceSet(
    client,
    timeoutMs,
    fcPriceSetId,
    activationAt,
  )
  const statusAfterResult = await deps.readPriceSetStatus(client, timeoutMs)

  return {
    ok: true,
    accepted: true,
    data: {
      fcPriceSetId,
      activationAt,
      response: responseResult.response,
      responseSubCode: responseResult.usedSubCode,
      statusAfter: statusAfterResult.response,
      capabilities: {
        priceSetStatusSubCode: statusAfterResult.usedSubCode,
        supportsPendingQueue: statusAfterResult.supportsPendingQueue,
        clearPendingPriceSetSubCode: responseResult.usedSubCode,
      },
    },
  }
}

export async function handleChangeGradePrices(
  context: JplCommandContext,
  deps: ResolvedPricingCommandDeps,
) {
  const { client, cmd, timeoutMs } = context
  const payload = ((cmd as any).payload ?? {}) as Record<string, unknown>
  const entries = extractEntries(payload)
  if (!entries.length) {
    return {
      ok: false,
      accepted: false,
      error: 'No price entries were provided',
    }
  }

  const requestedActivation =
    payload.activationAt ?? payload.effectiveAt ?? payload.effectiveDate
  const applyNow = payload.applyNow === true || requestedActivation == null
  const activationAt = applyNow
    ? ZERO_FC_DATE_TIME
    : toFcDateTime(requestedActivation)
  const requestedBy =
    String(
      payload.requestedBy ?? payload.userId ?? payload.UserId ?? 'system',
    ).trim() || 'system'

  const statusBeforeResult = await deps.readPriceSetStatus(client, timeoutMs)
  const statusBefore = statusBeforeResult.response
  const pendingBefore = statusBeforeResult.supportsPendingQueue
    ? extractPendingPriceSets(statusBefore)
    : []
  const warnings: string[] = []
  if (!applyNow && !statusBeforeResult.supportsPendingQueue) {
    warnings.push(
      'This controller only supports FcPriceSetStatus SUBC 00H, so pending scheduled price sets cannot be listed or verified.',
    )
  }

  let currentResponse: any = null
  let currentPriceSetSubCode: string | undefined
  try {
    const currentPriceSetResult = await deps.readCurrentPriceSet(
      client,
      timeoutMs,
    )
    currentResponse = currentPriceSetResult.response
    currentPriceSetSubCode = currentPriceSetResult.usedSubCode
  } catch {
    currentResponse = null
  }

  const currentBank = toPriceBank(currentResponse)
  const explicitBank = extractExplicitPriceBank(payload)
  const baseBank = currentBank ?? explicitBank
  if (!baseBank) {
    return {
      ok: false,
      accepted: false,
      error:
        'Unable to resolve the active DOMS price bank. Provide a full price bank payload or load prices on the controller first.',
    }
  }

  const mergedBank = mergePriceBank(baseBank, entries)
  if (
    !applyNow &&
    statusBeforeResult.supportsPendingQueue &&
    (payload.clearExistingAtSameActivation ??
      payload.replaceExistingAtSameActivation) === true
  ) {
    const toClear = pendingBefore.filter(
      (item) =>
        item.activationAt === activationAt &&
        item.fcPriceSetId === mergedBank.fcPriceSetId,
    )
    for (const item of toClear) {
      await deps.clearPendingPriceSet(
        client,
        timeoutMs,
        item.fcPriceSetId,
        item.activationAt,
      )
    }
  }

  const responseResult = await deps.changePriceSet(
    client,
    timeoutMs,
    {
      userId: requestedBy,
      fcPriceSetId: mergedBank.fcPriceSetId,
      fcPriceGroupIds: mergedBank.fcPriceGroupIds,
      fcGradeIds: mergedBank.fcGradeIds,
      fcPriceGroups: mergedBank.fcPriceGroups,
      activationAt,
    },
    {
      requirePreservePendingQueue: pendingBefore.length > 0,
    },
  )
  if (!responseResult.preservesPendingQueue) {
    warnings.push(
      `The controller accepted the price change via change_FcPriceSet ${responseResult.usedSubCode}, which can clear existing pending price sets automatically.`,
    )
  }

  const statusAfterResult = await deps.readPriceSetStatus(client, timeoutMs)
  const statusAfter = statusAfterResult.response

  if (applyNow) {
    let activePriceSet: any = null
    let activePriceSetSubCode: string | undefined
    let activeBank: PriceBank | null = null
    try {
      const activeResult = await deps.readCurrentPriceSet(client, timeoutMs)
      activePriceSet = activeResult.response
      activePriceSetSubCode = activeResult.usedSubCode
      activeBank = toPriceBank(activePriceSet)
    } catch {
      activePriceSet = null
    }

    const verifiedOnController = priceBanksMatch(mergedBank, activeBank)
    if (!verifiedOnController) {
      logger.warn('[jpl]', {
        msg: 'immediate price change accepted without active-bank verification',
        fcPriceSetId: mergedBank.fcPriceSetId,
        changePriceSetSubCode: responseResult.usedSubCode,
        activePriceSetSubCode,
      })
    }

    return {
      ok: true,
      accepted: true,
      data: {
        requestedBy,
        activationAt,
        applyNow: true,
        scheduled: null,
        controllerAccepted: true,
        verifiedOnController,
        response: responseResult.response,
        responseSubCode: responseResult.usedSubCode,
        statusBefore,
        statusAfter,
        activePriceSet,
        priceBank: mergedBank,
        warnings,
        capabilities: {
          priceSetStatusSubCode: statusBeforeResult.usedSubCode,
          supportsPendingQueue: statusBeforeResult.supportsPendingQueue,
          currentPriceSetSubCode: activePriceSetSubCode ?? currentPriceSetSubCode,
          changePriceSetSubCode: responseResult.usedSubCode,
        },
      },
    }
  }

  const pendingAfter = statusAfterResult.supportsPendingQueue
    ? extractPendingPriceSets(statusAfter)
    : []
  const requestedPending = pendingAfter.find(
    (item) =>
      item.activationAt === activationAt &&
      item.fcPriceSetId === mergedBank.fcPriceSetId,
  )

  if (!requestedPending) {
    logger.warn('[jpl]', {
      msg: 'price scheduling accepted without queue verification',
      activationAt,
      fcPriceSetId: mergedBank.fcPriceSetId,
      changePriceSetSubCode: responseResult.usedSubCode,
      priceSetStatusSubCode: statusAfterResult.usedSubCode,
      supportsPendingQueue: statusAfterResult.supportsPendingQueue,
    })
  }

  return {
    ok: true,
    accepted: true,
    data: {
      requestedBy,
      activationAt,
      applyNow: false,
      scheduled: requestedPending ?? null,
      controllerAccepted: true,
      verifiedOnController: Boolean(requestedPending),
      response: responseResult.response,
      responseSubCode: responseResult.usedSubCode,
      statusBefore,
      statusAfter,
      priceBank: mergedBank,
      warnings,
      capabilities: {
        priceSetStatusSubCode: statusBeforeResult.usedSubCode,
        supportsPendingQueue: statusBeforeResult.supportsPendingQueue,
        currentPriceSetSubCode,
        changePriceSetSubCode: responseResult.usedSubCode,
      },
    },
  }
}
