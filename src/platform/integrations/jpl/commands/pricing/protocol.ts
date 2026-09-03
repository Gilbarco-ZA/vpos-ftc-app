import {
  buildCommandVariant,
  requestWithSubCodeFallback,
} from '@/src/platform/integrations/jpl/protocol/runtime'

import type {
  ChangePriceSetOptions,
  ChangePriceSetPayload,
} from './contracts'

export async function readPriceSetStatus(client: any, timeoutMs: number) {
  const result = await requestWithSubCodeFallback(client, {
    name: 'FcPriceSetStatus_req',
    variants: [
      buildCommandVariant('READ_PRICE_SET_STATUS', { subCode: '01H' }),
      buildCommandVariant('READ_PRICE_SET_STATUS', { subCode: '00H' }),
    ],
    timeoutMs,
    timeoutMessage: 'Timed out requesting price set status',
  })

  return {
    ...result,
    supportsPendingQueue: result.usedSubCode === '01H',
  }
}

export async function readCurrentPriceSet(client: any, timeoutMs: number) {
  return await requestWithSubCodeFallback(client, {
    name: 'FcPriceSet_req',
    variants: [
      buildCommandVariant('READ_CURRENT_PRICE_SET', { subCode: '04H' }),
      buildCommandVariant('READ_CURRENT_PRICE_SET', { subCode: '03H' }),
      buildCommandVariant('READ_CURRENT_PRICE_SET', { subCode: '02H' }),
    ],
    timeoutMs,
    timeoutMessage: 'Timed out requesting current price set',
  })
}

export async function readSpecificPriceSet(
  client: any,
  timeoutMs: number,
  fcPriceSetId: string,
  activationAt: string,
) {
  return await requestWithSubCodeFallback(client, {
    name: 'FcPriceSet_req',
    variants: [
      buildCommandVariant('READ_PENDING_PRICE_SET', {
        subCode: '04H',
        fcPriceSetId,
        activationAt,
      }),
    ],
    timeoutMs,
    timeoutMessage: 'Timed out requesting pending price set',
  })
}

export async function changePriceSet(
  client: any,
  timeoutMs: number,
  payload: ChangePriceSetPayload,
  options: ChangePriceSetOptions = {},
) {
  const variants = [
    buildCommandVariant('CHANGE_PRICE_SET', { ...payload, subCode: '04H' }),
  ]

  if (!options.requirePreservePendingQueue) {
    variants.push(
      buildCommandVariant('CHANGE_PRICE_SET', { ...payload, subCode: '03H' }),
      buildCommandVariant('CHANGE_PRICE_SET', { ...payload, subCode: '02H' }),
    )
  }

  const result = await requestWithSubCodeFallback(client, {
    name: 'change_FcPriceSet_req',
    variants,
    timeoutMs,
    timeoutMessage: 'Timed out changing price set',
  })

  return {
    ...result,
    preservesPendingQueue: result.usedSubCode === '04H',
  }
}

export async function clearPendingPriceSet(
  client: any,
  timeoutMs: number,
  fcPriceSetId: string,
  activationAt: string,
) {
  const variant = buildCommandVariant('CLEAR_PENDING_PRICE_SET', {
    fcPriceSetId,
    activationAt,
  })

  return await requestWithSubCodeFallback(client, {
    name: 'clear_PendingFcPriceSet_req',
    variants: [
      variant,
      {
        ...variant,
        name: 'clear_pendingFcPriceSet_req',
      },
    ],
    timeoutMs,
    timeoutMessage: 'Timed out clearing pending price set',
  })
}
