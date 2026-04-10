import {
  jplHealth,
  jplSendPosCommand,
} from '@/src/platform/integrations/jpl/client'
import { enqueuePrintJob } from '@/src/shared/print/queue'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

function parsePath(pathValue: string) {
  const url = new URL(pathValue, 'http://localhost')
  const pathname = url.pathname.replace(/\/+$/, '') || '/'
  return { pathname, searchParams: url.searchParams }
}

function toCommand(
  pathValue: string,
  opts: { method?: string; body?: any },
): { kind: 'health' } | { kind: 'command'; type: string; payload?: any } {
  const { pathname, searchParams } = parsePath(pathValue)
  const method = String(opts.method ?? 'GET')
    .trim()
    .toUpperCase()
  const payload = opts.body

  if (method === 'GET' && pathname === '/health') {
    return { kind: 'health' }
  }
  if (method === 'GET' && pathname === '/pos/status') {
    return { kind: 'command', type: 'POS_STATUS' }
  }
  if (pathname === '/pos/doms/getGradePrices') {
    return {
      kind: 'command',
      type: 'GET_GRADE_PRICES',
      payload: {
        ...(payload ?? {}),
        ...(searchParams.get('type') ? { type: searchParams.get('type') } : {}),
      },
    }
  }
  if (pathname === '/pos/doms/changeGradePrices') {
    return { kind: 'command', type: 'CHANGE_GRADE_PRICES', payload }
  }
  if (method === 'GET' && pathname === '/pos/doms/getAllTankDeliveryData') {
    return { kind: 'command', type: 'GET_ALL_TANK_DELIVERY_DATA' }
  }
  if (method === 'GET' && pathname === '/pos/doms/getAllTgData') {
    return { kind: 'command', type: 'GET_ALL_TG_DATA' }
  }
  if (pathname === '/pos/doms/changeDynamicTankData') {
    return { kind: 'command', type: 'CHANGE_DYNAMIC_TANK_DATA', payload }
  }
  if (pathname === '/pos/doms/getTgErrorMsg') {
    return { kind: 'command', type: 'GET_TG_ERROR_MSG', payload }
  }
  if (pathname === '/pos/control/openFps') {
    return { kind: 'command', type: 'OPEN_FPS', payload }
  }
  if (pathname === '/pos/control/closeFps') {
    return { kind: 'command', type: 'CLOSE_FPS', payload }
  }
  if (pathname === '/pos/control/attendantAuth') {
    return { kind: 'command', type: 'ATTENDANT_AUTH', payload }
  }
  if (pathname === '/pos/control/preFuelCustomer') {
    return { kind: 'command', type: 'PREFUEL_CUSTOMER', payload }
  }
  if (pathname === '/pos/control/clearPreFuelCustomer') {
    return { kind: 'command', type: 'CLEAR_PREFUEL_CUSTOMER', payload }
  }
  if (pathname === '/pos/control/clearFpError') {
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

  const id = await enqueuePrintJob(
    normalizedStationId,
    'print.receipt',
    basePayload,
    0,
    body.idempotencyKey ? { idempotencyKey: String(body.idempotencyKey) } : {},
  )

  return { ok: true, accepted: true, printJobId: id }
}

export async function jplRequest(
  stationId: string,
  path: string,
  opts: { method?: string; body?: any } = {},
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const target = toCommand(requireNonEmptyString(path, 'path'), opts)

  if (target.kind === 'health') {
    return await jplHealth(normalizedStationId)
  }

  const result = await jplSendPosCommand(normalizedStationId, {
    type: target.type,
    payload: target.payload,
  })

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
