import type { ReportsAdapter } from '@/src/modules/reports/infrastructure/adapters/types'

import { MockReportsAdapter } from '@/src/modules/reports/infrastructure/adapters/mock'
import { TzReportsAdapter } from '@/src/modules/reports/infrastructure/adapters/tz'

export function getReportsAdapter(
  engine: string | null | undefined,
): ReportsAdapter {
  const normalized = String(engine ?? '').toUpperCase()
  if (normalized === 'TZ') return new TzReportsAdapter()
  return new MockReportsAdapter()
}
