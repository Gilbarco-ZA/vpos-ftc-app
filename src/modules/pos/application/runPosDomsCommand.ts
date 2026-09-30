import { NextResponse } from 'next/server'

import { executePosDomsCommand } from './executePosDomsCommand'
import type { PosDomsRouteCommand } from './posDomsTypes'

import {
  legacyDomsFailure,
  legacyDomsSuccess,
} from '@/src/shared/vpos/legacyPosApi'

import {
  deletePendingForecourtPriceSet,
  upsertPendingForecourtPriceSet,
} from '@/src/modules/forecourt/infrastructure/pendingPriceSetsRepo'
import { appendForecourtPriceScheduleEvent } from '@/src/modules/forecourt/infrastructure/priceScheduleEventsRepo'
import {
  appendWetstockEvent,
  markTankDeliveryCheckpointCleared,
} from '@/src/modules/forecourt/infrastructure/wetstockLifecycleRepo'
import { dispatchPosDomsCommand } from '@/src/modules/pos/application/legacy/doms'

import type { PosDomsRouteCommand } from './posDomsTypes'


export async function runPosDomsCommand(
  stationId: string,
  command: PosDomsRouteCommand,
  body: Record<string, unknown>,
  options: {
    userId?: string
  } = {},
) {
  const result = await executePosDomsCommand(stationId, command, body, options)

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: result.message,
        error: result.error,
      },
      { status: 200 },
    )
  }

  return NextResponse.json({
    success: true,
    message: result.message,
    data: result.data,
  })
}
