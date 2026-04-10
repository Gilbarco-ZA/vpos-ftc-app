import { assertSupportedFiscalEngine } from '@/src/shared/fiscalization/engines'

import type { FiscalAdapter, FiscalEngine } from './types'
import { keAdapter } from './ke'
import { mockAdapter } from './mock'
import { tzAdapter } from './tz'

const ADAPTERS: Record<string, FiscalAdapter> = {
  TZ: tzAdapter,
  KE: keAdapter,
  mock: mockAdapter,
}

export function getFiscalAdapter(engine: FiscalEngine): FiscalAdapter {
  const code = String(engine || '').trim() || 'mock'
  assertSupportedFiscalEngine(code)
  const adapter = ADAPTERS[code]
  if (!adapter) {
    // Engine is supported in config but adapter isn't implemented yet
    throw new Error(`Fiscal adapter for "${code}" is not implemented`)
  }
  return adapter
}
