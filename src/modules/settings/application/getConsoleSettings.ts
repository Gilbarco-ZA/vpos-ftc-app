import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getConsoleSettingsRepo } from '@/src/modules/settings/infrastructure/settingsRepo'

export async function getConsoleSettings(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  return (await getConsoleSettingsRepo(normalizedStationId)) ?? {}
}
