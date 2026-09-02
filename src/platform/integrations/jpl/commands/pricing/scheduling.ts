import type { JplCommandContext } from '@/src/platform/integrations/jpl/commands/contracts'

import { logger } from '@/src/shared/utils/logger'

import type { ResolvedPricingCommandDeps } from './contracts'
import {
  extractEntries,
  extractExplicitPriceBank,
  extractPendingPriceSets,
  mergePriceBank,
  toFcDateTime,
  toId2String,
  toPriceBank,
} from './mapping'

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
      error: 'No price entries were provided for scheduling',
    }
  }

  const activationAt = toFcDateTime(
    payload.activationAt ?? payload.effectiveAt ?? payload.effectiveDate,
  )
  const requestedBy =
    String(
      payload.requestedBy ?? payload.userId ?? payload.UserId ?? 'system',
    ).trim() || 'system'

  const statusBeforeResult = await deps.readPriceSetStatus(client, timeoutMs)
  const statusBefore = statusBeforeResult.response
  const warnings: string[] = []
  if (!statusBeforeResult.supportsPendingQueue) {
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
    statusBeforeResult.supportsPendingQueue &&
    (payload.clearExistingAtSameActivation ??
      payload.replaceExistingAtSameActivation) === true
  ) {
    const pending = extractPendingPriceSets(statusBefore)
    const toClear = pending.filter(
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

  const responseResult = await deps.changePriceSet(client, timeoutMs, {
    userId: requestedBy,
    fcPriceSetId: mergedBank.fcPriceSetId,
    fcPriceGroupIds: mergedBank.fcPriceGroupIds,
    fcGradeIds: mergedBank.fcGradeIds,
    fcPriceGroups: mergedBank.fcPriceGroups,
    activationAt,
  })
  if (!responseResult.preservesPendingQueue) {
    warnings.push(
      `The controller accepted scheduling via change_FcPriceSet ${responseResult.usedSubCode}, which may clear existing pending price sets automatically.`,
    )
  }

  const statusAfterResult = await deps.readPriceSetStatus(client, timeoutMs)
  const statusAfter = statusAfterResult.response
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
