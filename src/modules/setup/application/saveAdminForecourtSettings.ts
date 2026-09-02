import type { SaveForecourtSettingsInput } from '@/src/modules/forecourt/application/forecourtSettings'
import { NextResponse } from 'next/server'

import { saveForecourtSettings } from '@/src/modules/forecourt/application/forecourtSettings'

export async function saveAdminForecourtSettings(
  stationId: string,
  body: SaveForecourtSettingsInput | null | undefined,
) {
  const updated = await saveForecourtSettings(stationId, body || {})

  return NextResponse.json({
    success: true,
    data: updated,
    meta: {
      restartRecommended: true,
      message:
        'Forecourt settings saved. Restart the FTC server process to apply connection changes.',
    },
  })
}
