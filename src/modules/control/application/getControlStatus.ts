import { NextResponse } from "next/server";

import { getControlRuntimeStatus } from '@/src/shared/control/runtime'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function getControlStatus(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const data = await getControlRuntimeStatus(scopedStationId)
  return NextResponse.json({ ok: true, data })
}
