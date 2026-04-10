import type {
  PosCommand,
  PosCommandResult,
} from '@/src/platform/integrations/jpl/types'

import { jplSendPosCommand } from '@/src/platform/integrations/jpl/client'
import { getEffectivePosBackend } from '@/src/shared/integrations/posBackend'

/**
 * Single entry point for sending POS commands, regardless of which backend is active.
 */
export async function sendPosCommand(
  stationId: string,
  cmd: PosCommand,
): Promise<PosCommandResult> {
  const backend = await getEffectivePosBackend(stationId)

  if (backend === 'jpl') {
    return await jplSendPosCommand(stationId, cmd)
  }

  return {
    ok: false,
    accepted: false,
    message: `POS backend '${backend}' is not enabled for commands`,
  }
}
