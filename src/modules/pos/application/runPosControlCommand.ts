import { executePosControlCommand } from '@/src/modules/pos/application/legacy/control'

import type { PosControlRouteCommand } from './posControlTypes'

export async function runPosControlCommand(args: {
  stationId: string
  command: PosControlRouteCommand
  body: Record<string, unknown>
}) {
  if (!args.stationId) {
    throw new Error('stationId is required')
  }

  return await executePosControlCommand(
    args.stationId,
    args.command,
    args.body ?? {},
  )
}
