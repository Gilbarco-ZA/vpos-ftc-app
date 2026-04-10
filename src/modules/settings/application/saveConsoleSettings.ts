import { saveConsoleSettingsRepo } from '@/src/modules/settings/infrastructure/settingsRepo'

export function extractConsoleSettingsValue(body: Record<string, unknown>) {
  const value = (body?.settings ?? body) as Record<string, unknown>
  return value && typeof value === 'object' ? value : {}
}

export async function saveConsoleSettings(
  stationId: string,
  body: Record<string, unknown>,
) {
  const value = extractConsoleSettingsValue(body)
  await saveConsoleSettingsRepo(stationId, value)
  return { success: true }
}
