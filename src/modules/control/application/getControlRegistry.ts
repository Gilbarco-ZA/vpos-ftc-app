import { NextResponse } from 'next/server'

import { getControlRegistryPayload } from '@/src/modules/control/application/control/registry'

export async function getControlRegistry() {
  return NextResponse.json({ ok: true, registry: getControlRegistryPayload() })
}
