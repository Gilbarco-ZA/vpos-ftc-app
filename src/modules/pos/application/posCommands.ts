import type {
  PosCommandRequest,
  PosCommandResult,
  PosCommandType,
} from '@/src/modules/pos/contracts/commands'

import { query, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { POS_COMMAND_TYPES } from '@/src/modules/pos/contracts/commands'

export { POS_COMMAND_TYPES }
export type { PosCommandRequest, PosCommandResult, PosCommandType }

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
