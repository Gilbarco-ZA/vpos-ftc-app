import { query, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type PosCommandType =
  | 'POS_STATUS'
  | 'COMPLETE_TRANSACTION'
  | 'CAPTURE_CUSTOMER_DETAILS'
  | 'CLEAR_CUSTOMER_DETAILS'
  | 'GET_DAILY_DATA'
  | 'PING'
  | 'OPEN_FPS'
  | 'CLOSE_FPS'
  | 'ATTENDANT_AUTH'
  | 'PREFUEL_CUSTOMER'
  | 'CLEAR_PREFUEL_CUSTOMER'
  | 'CLEAR_FP_ERROR'
  | 'GET_GRADE_PRICES'
  | 'CHANGE_GRADE_PRICES'
  | 'GET_ALL_TANK_DELIVERY_DATA'
  | 'GET_ALL_TG_DATA'
  | 'CHANGE_DYNAMIC_TANK_DATA'
  | 'GET_TG_ERROR_MSG'

export const POS_COMMAND_TYPES: PosCommandType[] = [
  'POS_STATUS',
  'COMPLETE_TRANSACTION',
  'CAPTURE_CUSTOMER_DETAILS',
  'CLEAR_CUSTOMER_DETAILS',
  'GET_DAILY_DATA',
  'PING',
  'OPEN_FPS',
  'CLOSE_FPS',
  'ATTENDANT_AUTH',
  'PREFUEL_CUSTOMER',
  'CLEAR_PREFUEL_CUSTOMER',
  'CLEAR_FP_ERROR',
  'GET_GRADE_PRICES',
  'CHANGE_GRADE_PRICES',
  'GET_ALL_TANK_DELIVERY_DATA',
  'GET_ALL_TG_DATA',
  'CHANGE_DYNAMIC_TANK_DATA',
  'GET_TG_ERROR_MSG',
]

export type PosCommandRequest = {
  type: PosCommandType
  payload?: any
}

export type PosCommandResult = {
  ok: boolean
  type: PosCommandType
  data?: any
  error?: { message: string; code?: string; details?: any }
}

export async function enqueuePosCommand(args: {
  stationId: string
  requestedBy?: string | null
  cmd: { type: string; payload?: any }
}) {
  const commandId = uuidv4()
  await query(
    `INSERT INTO pos_commands (id, station_id, command, payload, status, requested_by, requested_at, updated_at)
     VALUES ($1, $2, $3, $4, 'PENDING', $5, NOW(), NOW())`,
    [
      commandId,
      args.stationId,
      args.cmd.type,
      args.cmd.payload ?? {},
      args.requestedBy ?? null,
    ],
  )
  await query(
    `INSERT INTO pos_command_results (id, command_id, status, result_json, received_at, updated_at)
     VALUES ($1, $2, 'PENDING', '{}'::jsonb, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [uuidv4(), commandId],
  )
  return { commandId }
}

export async function waitForPosCommandResult(args: {
  commandId: string
  timeoutMs?: number
  pollMs?: number
}) {
  const timeoutAt = Date.now() + Number(args.timeoutMs ?? 15_000)
  const pollMs = Math.max(100, Number(args.pollMs ?? 250))

  while (Date.now() <= timeoutAt) {
    const row = await queryOne<{ status: string; result_json: any }>(
      `SELECT status, result_json FROM pos_command_results WHERE command_id = $1`,
      [args.commandId],
    )

    if (row && row.status !== 'PENDING') {
      return row.result_json ?? null
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }

  return {
    ok: false,
    message: 'Timed out waiting for POS command result',
    commandId: args.commandId,
  }
}

export { handlePosCommand as handleSharedPosCommand } from '@/src/modules/pos/infrastructure/posCommandHandler'
