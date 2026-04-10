import type { FirstBootResult } from '@/src/platform/bootstrap/first-boot'

import { ensureFirstBoot } from '@/src/platform/bootstrap/first-boot'

export type BootstrapStatus = FirstBootResult

export async function ensureBootstrapReady(runtimeStationId?: string) {
  return await ensureFirstBoot(runtimeStationId)
}
