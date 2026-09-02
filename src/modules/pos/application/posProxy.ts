import type { JplAccessMode } from '@/src/shared/integrations/jplAccess'

import {
  jplHealth,
  jplSendPosCommand,
} from '@/src/platform/integrations/jpl/client'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { enqueuePrintJob } from '@/src/modules/printing/application/enqueuePrintJob'

function parsePath(pathValue: string) {
  const url = new URL(pathValue, 'http://localhost')
  const pathname = url.pathname.replace(/\/+$/, '') || '/'
  return { pathname, searchParams: url.searchParams }
}

const matchesPath = (pathname: string, ...candidates: string[]) =>
  candidates.includes(pathname)

function toCommand(
  pathValue: string,
  opts: { method?: string; body?: any },
): { kind: 'health' } | { kind: 'command'; type: string; payload?: any } {
  const { pathname, searchParams } = parsePath(pathValue)
  const method = String(opts.method ?? 'GET')
    .trim()
    .toUpperCase()
  const payload = opts.body

  if (method === 'GET' && matchesPath(pathname, '/health', '/api/healthz')) {
    return { kind: 'health' }
  }
  if (
    method === 'GET' &&
    matchesPath(pathname, '/pos/status', '/api/pos/status')
  ) {
    return { kind: 'command', type: 'POS_STATUS' }
  }
  if (
    matchesPath(
      pathname,
      '/pos/doms/getGradePrices',
      '/api/pos/doms/getGradePrices',
    )
  ) {
    return {
      kind: 'command',
      type: 'GET_GRADE_PRICES',
      payload: {
        ...(payload ?? {}),
        ...(searchParams.get('type') ? { type: searchParams.get('type') } : {}),
      },
    }
  }
  if (
    matchesPath(
      pathname,
      '/pos/doms/changeGradePrices',
      '/api/pos/doms/changeGradePrices',
    )
  ) {
    return { kind: 'command', type: 'CHANGE_GRADE_PRICES', payload }
  }
  if (
    method === 'GET' &&
    matchesPath(
      pathname,
      '/pos/doms/getAllTankDeliveryData',
      '/api/pos/doms/getAllTankDeliveryData',
    )
  ) {
    return { kind: 'command', type: 'GET_ALL_TANK_DELIVERY_DATA' }
  }
  if (
    method === 'GET' &&
    matchesPath(
      pathname,
      '/pos/doms/getAllTgData',
      '/api/pos/doms/getAllTgData',
    )
  ) {
    return { kind: 'command', type: 'GET_ALL_TG_DATA', payload }
  }
  if (
    method === 'GET' &&
    matchesPath(
      pathname,
      '/pos/doms/getSiteDeliveryStatus',
      '/api/pos/doms/getSiteDeliveryStatus',
    )
  ) {
    return {
      kind: 'command',
      type: 'GET_SITE_DELIVERY_STATUS',
      payload: {
        ...(payload ?? {}),
        ...(searchParams.get('subCode')
          ? { subCode: searchParams.get('subCode') }
          : {}),
      },
    }
  }
  if (
    method === 'GET' &&
    matchesPath(pathname, '/pos/doms/getTgStatus', '/api/pos/doms/getTgStatus')
  ) {
    return {
      kind: 'command',
      type: 'GET_TG_STATUS',
      payload: {
        ...(payload ?? {}),
        ...(searchParams.get('tgId') ? { tgId: searchParams.get('tgId') } : {}),
        ...(searchParams.get('subCode')
          ? { subCode: searchParams.get('subCode') }
          : {}),
      },
    }
  }
  if (
    matchesPath(
      pathname,
      '/pos/doms/clearTankDeliveryData',
      '/api/pos/doms/clearTankDeliveryData',
    )
  ) {
    return { kind: 'command', type: 'CLEAR_TANK_DELIVERY_DATA', payload }
  }
  if (
    matchesPath(
      pathname,
      '/pos/doms/openTankController',
      '/api/pos/doms/openTankController',
    )
  ) {
    return { kind: 'command', type: 'OPEN_TANK_CONTROLLER', payload }
  }
  if (
    matchesPath(
      pathname,
      '/pos/doms/closeTankController',
      '/api/pos/doms/closeTankController',
    )
  ) {
    return { kind: 'command', type: 'CLOSE_TANK_CONTROLLER', payload }
  }
  if (
    matchesPath(
      pathname,
      '/pos/doms/startDeliveryProcess',
      '/api/pos/doms/startDeliveryProcess',
    )
  ) {
    return { kind: 'command', type: 'START_DELIVERY_PROCESS', payload }
  }
  if (
    matchesPath(
      pathname,
      '/pos/doms/stopDeliveryProcess',
      '/api/pos/doms/stopDeliveryProcess',
    )
  ) {
    return { kind: 'command', type: 'STOP_DELIVERY_PROCESS', payload }
  }
  if (
    matchesPath(
      pathname,
      '/pos/doms/changeDynamicTankData',
      '/api/pos/doms/changeDynamicTankData',
    )
  ) {
    return { kind: 'command', type: 'CHANGE_DYNAMIC_TANK_DATA', payload }
  }
  if (
    matchesPath(
      pathname,
      '/pos/doms/getTgErrorMsg',
      '/api/pos/doms/getTgErrorMsg',
    )
  ) {
    return { kind: 'command', type: 'GET_TG_ERROR_MSG', payload }
  }
  if (
    matchesPath(pathname, '/pos/control/openFps', '/api/pos/control/openFps')
  ) {
    return { kind: 'command', type: 'OPEN_FPS', payload }
  }
  if (
    matchesPath(pathname, '/pos/control/closeFps', '/api/pos/control/closeFps')
  ) {
    return { kind: 'command', type: 'CLOSE_FPS', payload }
  }
  if (
    matchesPath(
      pathname,
      '/pos/control/attendantAuth',
      '/api/pos/control/attendantAuth',
    )
  ) {
    return { kind: 'command', type: 'ATTENDANT_AUTH', payload }
  }
  if (
    matchesPath(
      pathname,
      '/pos/control/preFuelCustomer',
      '/api/pos/control/preFuelCustomer',
    )
  ) {
    return { kind: 'command', type: 'PREFUEL_CUSTOMER', payload }
  }
  if (
    matchesPath(
      pathname,
      '/pos/control/clearPreFuelCustomer',
      '/api/pos/control/clearPreFuelCustomer',
    )
  ) {
    return { kind: 'command', type: 'CLEAR_PREFUEL_CUSTOMER', payload }
  }
  if (
    matchesPath(
      pathname,
      '/pos/control/clearFpError',
      '/api/pos/control/clearFpError',
    )
  ) {
    return { kind: 'command', type: 'CLEAR_FP_ERROR', payload }
  }
  if (pathname === '/pos/command') {
    const type = String(payload?.type ?? '').trim()
    if (!type) {
      throw Object.assign(new Error('POS command type is required'), {
        code: 'INVALID_POS_COMMAND',
        status: 400,
      })
    }
    return { kind: 'command', type, payload: payload?.payload ?? payload }
  }

  throw Object.assign(new Error(`Unsupported JPL proxy path: ${pathname}`), {
    code: 'UNSUPPORTED_JPL_PROXY_PATH',
    status: 400,
    pathname,
  })
}

export async function enqueuePosPrintJob(stationId: string, payload: any) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const body = payload ?? {}
  const copies = Number(body.copies ?? body.copyCount ?? 1)
  const printable =
    body.data ?? body.content ?? body.receipt ?? body.template ?? body ?? {}

  const basePayload = {
    ...body,
    printable,
    copies: Number.isFinite(copies) && copies > 0 ? copies : 1,
  }

  const sourceTransactionId = String(
    body?.transactionId ??
      body?.data?.transactionId ??
      body?.state?.transactionId ??
      '',
  ).trim()
  const sourceKind = String(body?.data?.source ?? body?.source ?? '').trim()
  const useReferencePayload =
    Boolean(sourceTransactionId) && sourceKind === 'vpos.transaction-receipt'

  const id = await enqueuePrintJob(
    normalizedStationId,
    'print.receipt',
    basePayload,
    0,
    {
      ...(body.idempotencyKey
        ? { idempotencyKey: String(body.idempotencyKey) }
        : {}),
      ...(sourceTransactionId ? { sourceTransactionId } : {}),
      ...(useReferencePayload ? { payloadMode: 'reference' as const } : {}),
    },
  )

  return { ok: true, accepted: true, printJobId: id }
}

export async function jplRequest(
  stationId: string,
  path: string,
  opts: { method?: string; body?: any } = {},
  requestOptions: { accessMode?: JplAccessMode } = {},
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const target = toCommand(requireNonEmptyString(path, 'path'), opts)

  if (target.kind === 'health') {
    return await jplHealth(normalizedStationId, {
      accessMode: requestOptions.accessMode ?? 'pos',
    })
  }

  const result = await jplSendPosCommand(
    normalizedStationId,
    {
      type: target.type,
      payload: target.payload,
    },
    { accessMode: requestOptions.accessMode ?? 'pos' },
  )

  if (!result.ok) {
    throw Object.assign(
      new Error(result.error ?? result.message ?? 'JPL request failed'),
      {
        code: 'JPL_REQUEST_FAILED',
        status: 502,
        details: result,
      },
    )
  }

  return result.data ?? result
}
