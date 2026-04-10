import type {
  PosCommand,
  PosCommandResult,
} from '@/src/platform/integrations/jpl/types'

import { sendPosCommand } from '@/src/platform/integrations/posGateway'
import { getEffectivePosBackend } from '@/src/shared/integrations/posBackend'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'

export class PosControlRuntime {
  constructor(private stationId: string) {}

  private async hasIntegration(): Promise<boolean> {
    const backend = await getEffectivePosBackend(this.stationId)
    return backend !== 'none'
  }

  async command(cmd: PosCommand): Promise<PosCommandResult> {
    if (await this.hasIntegration()) {
      return await sendPosCommand(this.stationId, cmd)
    }

    switch (cmd.type) {
      case 'COMPLETE_TRANSACTION':
        await kvSet(
          this.stationId,
          'vpos.pos.lastTransaction',
          cmd.payload ?? {},
        )
        return {
          ok: true,
          accepted: true,
          message: 'Stored lastTransaction in KV',
        }

      case 'CAPTURE_CUSTOMER_DETAILS':
        await kvSet(this.stationId, 'vpos.customer.current', cmd.payload ?? {})
        return { ok: true, accepted: true }

      case 'CLEAR_CUSTOMER_DETAILS':
        await kvSet(this.stationId, 'vpos.customer.current', null)
        return { ok: true, accepted: true }

      case 'OPEN_SHIFT':
        await kvSet(this.stationId, 'vpos.shift.state', {
          open: true,
          at: new Date().toISOString(),
        })
        return { ok: true, accepted: true }

      case 'CLOSE_SHIFT':
        await kvSet(this.stationId, 'vpos.shift.state', {
          open: false,
          at: new Date().toISOString(),
        })
        return { ok: true, accepted: true }

      default:
        return { ok: true, accepted: true, message: 'No-op placeholder' }
    }
  }

  async getShiftState() {
    return (
      (await kvGet<any>(this.stationId, 'vpos.shift.state')) ?? { open: false }
    )
  }
}
