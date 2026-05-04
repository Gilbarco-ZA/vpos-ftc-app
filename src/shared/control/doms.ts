import { queryOne } from '@/src/platform/db/postgres'
import { CommandHandler } from '@/src/shared/control/types'
import {
  clearProcessErrors,
  getAllProcessHeartbeats,
} from '@/src/shared/runtime/heartbeats'
import { getRuntimeManager } from '@/src/shared/runtime/manager'
import {
  enqueuePosCommand,
  waitForPosCommandResult,
} from '@/src/shared/vpos/commands'

import { startPosCommandsWorker } from '@/src/modules/pos/infrastructure/posCommandsWorker'

const status: CommandHandler = async (ctx) => {
  const heartbeats = await getAllProcessHeartbeats(ctx.stationId).catch(
    () => [],
  )
  const queue = await queryOne<{
    pending: string
    sent: string
    completed: string
    failed: string
  }>(
    `SELECT
			SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END)::text as pending,
			SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END)::text as sent,
			SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END)::text as completed,
			SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)::text as failed
		 FROM pos_commands
		WHERE station_id = $1`,
    [ctx.stationId],
  )

  const supervisor = await getRuntimeManager(
    ctx.stationId,
  ).supervisor.getStatus()
  return {
    ok: true,
    supervisor,
    heartbeats,
    posCommands: {
      pending: Number(queue?.pending ?? 0),
      sent: Number(queue?.sent ?? 0),
      completed: Number(queue?.completed ?? 0),
      failed: Number(queue?.failed ?? 0),
    },
  }
}

const clearCaches: CommandHandler = async (ctx) => {
  await clearProcessErrors(ctx.stationId)
  return { ok: true }
}

async function enqueueAndMaybeWait(ctx: any, cmd: any) {
  const wait = (ctx.args as any)?.wait !== false
  const timeoutMs = Number((ctx.args as any)?.timeoutMs ?? 15_000)

  startPosCommandsWorker()
  const { commandId } = await enqueuePosCommand({
    stationId: ctx.stationId,
    requestedBy: ctx.userId ?? null,
    cmd,
  })

  if (!wait) return { ok: true, enqueued: true, commandId }
  const result = await waitForPosCommandResult({ commandId, timeoutMs })
  return { ok: true, enqueued: true, commandId, result }
}

/**
 * Generic enqueue interface (canonical in FTC):
 *   { type: string, payload?: any, wait?: boolean, timeoutMs?: number }
 */
const send: CommandHandler = async (ctx) => {
  const type = String((ctx.args as any)?.type ?? '')
  if (!type) return { ok: false, error: 'Missing command type' }
  const payload = (ctx.args as any)?.payload ?? null
  return await enqueueAndMaybeWait(ctx, { type: type as any, payload })
}

// ---- legacy-compatible handlers (vpos-console / vpos-app) ----

const ping: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, { type: 'PING' })
}

const posStatus: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, { type: 'POS_STATUS' })
}

const openFps: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'OPEN_FPS',
    payload: (ctx.args as any) ?? {},
  })
}

const closeFps: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'CLOSE_FPS',
    payload: (ctx.args as any) ?? {},
  })
}

const attendantAuth: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'ATTENDANT_AUTH',
    payload: (ctx.args as any) ?? {},
  })
}

const prefuelCustomer: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'PREFUEL_CUSTOMER',
    payload: (ctx.args as any) ?? {},
  })
}

const clearPrefuelCustomer: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'CLEAR_PREFUEL_CUSTOMER',
    payload: (ctx.args as any) ?? {},
  })
}

const clearFpError: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'CLEAR_FP_ERROR',
    payload: (ctx.args as any) ?? {},
  })
}

const getGradePrices: CommandHandler = async (ctx) => {
  const t = (ctx.args as any)?.type ?? (ctx.args as any)?.gradeType
  return await enqueueAndMaybeWait(ctx, {
    type: 'GET_GRADE_PRICES',
    payload: { type: t ? String(t) : undefined },
  })
}

const changeGradePrices: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'CHANGE_GRADE_PRICES',
    payload: (ctx.args as any) ?? {},
  })
}

const getAllTankDeliveryData: CommandHandler = async () => {
  // no payload
  return await enqueueAndMaybeWait(
    { args: {} },
    { type: 'GET_ALL_TANK_DELIVERY_DATA' },
  )
}

const getAllTgData: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'GET_ALL_TG_DATA',
    payload: (ctx.args as any) ?? {},
  })
}

const getSiteDeliveryStatus: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'GET_SITE_DELIVERY_STATUS',
    payload: (ctx.args as any) ?? {},
  })
}

const getTgStatus: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'GET_TG_STATUS',
    payload: (ctx.args as any) ?? {},
  })
}

const clearTankDeliveryData: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'CLEAR_TANK_DELIVERY_DATA',
    payload: (ctx.args as any) ?? {},
  })
}

const openTankController: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'OPEN_TANK_CONTROLLER',
    payload: (ctx.args as any) ?? {},
  })
}

const closeTankController: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'CLOSE_TANK_CONTROLLER',
    payload: (ctx.args as any) ?? {},
  })
}

const startDeliveryProcess: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'START_DELIVERY_PROCESS',
    payload: (ctx.args as any) ?? {},
  })
}

const stopDeliveryProcess: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'STOP_DELIVERY_PROCESS',
    payload: (ctx.args as any) ?? {},
  })
}

const changeDynamicTankData: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'CHANGE_DYNAMIC_TANK_DATA',
    payload: (ctx.args as any) ?? {},
  })
}

const getTgErrorMsg: CommandHandler = async (ctx) => {
  return await enqueueAndMaybeWait(ctx, {
    type: 'GET_TG_ERROR_MSG',
    payload: (ctx.args as any) ?? {},
  })
}

export const domsCommands: Record<string, CommandHandler> = {
  // canonical
  status,
  'clear-caches': clearCaches,
  send,

  // canonical alias (internal)
  clearCaches,

  // legacy keys
  ping,
  'pos-status': posStatus,
  posStatus,

  openFps,
  open_fps: openFps,
  closeFps,
  close_fps: closeFps,

  attendantAuth,
  attendant_auth: attendantAuth,

  prefuelCustomer,
  prefuel_customer: prefuelCustomer,

  clearPrefuelCustomer,
  clear_prefuel_customer: clearPrefuelCustomer,

  clearFpError,
  clear_fp_error: clearFpError,

  getGradePrices,
  get_grade_prices: getGradePrices,

  changeGradePrices,
  change_grade_prices: changeGradePrices,

  getAllTankDeliveryData,
  get_all_tank_delivery_data: getAllTankDeliveryData,

  getAllTgData,
  get_all_tg_data: getAllTgData,
  getSiteDeliveryStatus,
  get_site_delivery_status: getSiteDeliveryStatus,
  getTgStatus,
  get_tg_status: getTgStatus,
  clearTankDeliveryData,
  clear_tank_delivery_data: clearTankDeliveryData,
  openTankController,
  open_tank_controller: openTankController,
  closeTankController,
  close_tank_controller: closeTankController,
  startDeliveryProcess,
  start_delivery_process: startDeliveryProcess,
  stopDeliveryProcess,
  stop_delivery_process: stopDeliveryProcess,
  changeDynamicTankData,
  change_dynamic_tank_data: changeDynamicTankData,
  getTgErrorMsg,
  get_tg_error_msg: getTgErrorMsg,
}

export const domsCommandAliases: Record<string, string> = {
  // canonical (ftc)
  status: 'status',
  'clear-caches': 'clear-caches',
  send: 'send',
  clearCaches: 'clear-caches',

  // legacy aliases → canonical
  ping: 'ping',
  'pos-status': 'pos-status',
  posStatus: 'pos-status',

  openFps: 'openFps',
  open_fps: 'openFps',
  closeFps: 'closeFps',
  close_fps: 'closeFps',
  attendantAuth: 'attendantAuth',
  attendant_auth: 'attendantAuth',
  prefuelCustomer: 'prefuelCustomer',
  prefuel_customer: 'prefuelCustomer',
  clearPrefuelCustomer: 'clearPrefuelCustomer',
  clear_prefuel_customer: 'clearPrefuelCustomer',
  clearFpError: 'clearFpError',
  clear_fp_error: 'clearFpError',

  getGradePrices: 'getGradePrices',
  get_grade_prices: 'getGradePrices',
  changeGradePrices: 'changeGradePrices',
  change_grade_prices: 'changeGradePrices',
  getAllTankDeliveryData: 'getAllTankDeliveryData',
  get_all_tank_delivery_data: 'getAllTankDeliveryData',
  getAllTgData: 'getAllTgData',
  get_all_tg_data: 'getAllTgData',
  getSiteDeliveryStatus: 'getSiteDeliveryStatus',
  get_site_delivery_status: 'getSiteDeliveryStatus',
  getTgStatus: 'getTgStatus',
  get_tg_status: 'getTgStatus',
  clearTankDeliveryData: 'clearTankDeliveryData',
  clear_tank_delivery_data: 'clearTankDeliveryData',
  openTankController: 'openTankController',
  open_tank_controller: 'openTankController',
  closeTankController: 'closeTankController',
  close_tank_controller: 'closeTankController',
  startDeliveryProcess: 'startDeliveryProcess',
  start_delivery_process: 'startDeliveryProcess',
  stopDeliveryProcess: 'stopDeliveryProcess',
  stop_delivery_process: 'stopDeliveryProcess',
  changeDynamicTankData: 'changeDynamicTankData',
  change_dynamic_tank_data: 'changeDynamicTankData',
  getTgErrorMsg: 'getTgErrorMsg',
  get_tg_error_msg: 'getTgErrorMsg',
}

export function describeDomsCommands() {
  const byCanonical: Record<string, { canonical: string; aliases: string[] }> =
    {}
  for (const [alias, canonical] of Object.entries(domsCommandAliases)) {
    if (!byCanonical[canonical])
      byCanonical[canonical] = { canonical, aliases: [] }
    if (alias !== canonical) byCanonical[canonical].aliases.push(alias)
  }

  return Object.values(byCanonical).map((c) => ({
    name: c.canonical,
    aliases: c.aliases.sort(),
    http: {
      method: 'POST',
      path: '/api/control/doms/{command}',
      altPath: '/api/doms/{command}',
    },
    auth: ['administrator', 'manager'] as const,
  }))
}
