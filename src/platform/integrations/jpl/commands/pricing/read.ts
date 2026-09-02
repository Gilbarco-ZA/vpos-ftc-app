import type { JplCommandContext } from '@/src/platform/integrations/jpl/commands/contracts'

import type { ResolvedPricingCommandDeps } from './contracts'
import { extractPendingPriceSets, toFcDateTime, toId2String } from './mapping'

export async function handleGetGradePrices(
  context: JplCommandContext,
  deps: ResolvedPricingCommandDeps,
) {
  const { client, cmd, timeoutMs } = context
  const payload = ((cmd as any).payload ?? {}) as Record<string, unknown>
  const type = String(payload.type ?? 'current')
    .trim()
    .toLowerCase()
  const statusResult = await deps.readPriceSetStatus(client, timeoutMs)
  const status = statusResult.response
  const pending = statusResult.supportsPendingQueue
    ? extractPendingPriceSets(status)
    : []
  const warnings: string[] = []

  if (!statusResult.supportsPendingQueue) {
    warnings.push(
      'This controller only supports FcPriceSetStatus SUBC 00H, so pending scheduled price sets cannot be listed.',
    )
  }

  if (type === 'pending') {
    const requestedPriceSetId = toId2String(
      payload.fcPriceSetId ?? payload.priceSetId,
      '',
    )
    const requestedActivationAt = String(
      payload.activationAt ??
        payload.effectiveAt ??
        payload.effectiveDate ??
        '',
    ).trim()
    const normalizedActivationAt = requestedActivationAt
      ? toFcDateTime(requestedActivationAt)
      : ''
    const matchedPending = pending.find((item) => {
      const byId = requestedPriceSetId
        ? item.fcPriceSetId === requestedPriceSetId
        : true
      const byActivation = normalizedActivationAt
        ? item.activationAt === normalizedActivationAt
        : true
      return byId && byActivation
    })

    if (!matchedPending) {
      return {
        ok: true,
        accepted: true,
        data: {
          status,
          pending,
          current: null,
          requestedPending: null,
          warnings,
          capabilities: {
            priceSetStatusSubCode: statusResult.usedSubCode,
            supportsPendingQueue: statusResult.supportsPendingQueue,
            supportsSpecificPendingPriceSet: false,
          },
        },
      }
    }

    let requestedPending: any = null
    let requestedPendingError: string | undefined
    let requestedPendingSubCode: string | undefined
    try {
      const requestedPendingResult = await deps.readSpecificPriceSet(
        client,
        timeoutMs,
        matchedPending.fcPriceSetId,
        matchedPending.activationAt,
      )
      requestedPending = requestedPendingResult.response
      requestedPendingSubCode = requestedPendingResult.usedSubCode
    } catch (error: any) {
      requestedPendingError = error?.message ?? String(error)
      warnings.push(
        'The controller reported the pending activation queue but did not allow reading a specific pending price set.',
      )
    }

    return {
      ok: true,
      accepted: true,
      data: {
        status,
        pending,
        current: null,
        requestedPending,
        requestedPendingError,
        warnings,
        capabilities: {
          priceSetStatusSubCode: statusResult.usedSubCode,
          supportsPendingQueue: statusResult.supportsPendingQueue,
          supportsSpecificPendingPriceSet: Boolean(requestedPendingSubCode),
          pendingPriceSetSubCode: requestedPendingSubCode,
        },
      },
    }
  }

  let current: any = null
  let currentError: string | undefined
  let currentSubCode: string | undefined
  try {
    const currentResult = await deps.readCurrentPriceSet(client, timeoutMs)
    current = currentResult.response
    currentSubCode = currentResult.usedSubCode
  } catch (error: any) {
    currentError = error?.message ?? String(error)
  }

  return {
    ok: true,
    accepted: true,
    data: {
      status,
      pending,
      current,
      currentError,
      warnings,
      capabilities: {
        priceSetStatusSubCode: statusResult.usedSubCode,
        supportsPendingQueue: statusResult.supportsPendingQueue,
        currentPriceSetSubCode: currentSubCode,
        supportsSpecificPendingPriceSet: false,
      },
    },
  }
}
