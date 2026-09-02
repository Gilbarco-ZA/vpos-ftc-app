import { NextResponse } from 'next/server'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getControlRuntimeStatus } from '@/src/modules/control/application/control/runtime'

export async function getControlStatus(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const data = await getControlRuntimeStatus(scopedStationId)
  return NextResponse.json({ ok: true, data })
}
