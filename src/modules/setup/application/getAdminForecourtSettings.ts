import { NextResponse } from 'next/server'

import { getForecourtSettings } from '@/src/modules/forecourt/application/forecourtSettings'

export async function getAdminForecourtSettings(stationId: string) {
  const settings = await getForecourtSettings(stationId)
  return NextResponse.json({ success: true, data: settings })
}
