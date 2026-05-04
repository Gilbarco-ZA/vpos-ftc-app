import { notFound } from 'next/navigation'

import { queryOne } from '@/src/platform/db/postgres'
import { requireAuth } from '@/src/shared/auth'

import PumpDetailClient from './client'

export const dynamic = 'force-dynamic'

const SettingsPumpDetailPage = async (
  props: {
    params: Promise<{ id: string }>
  }
) => {
  const params = await props.params;
  const user = await requireAuth(['administrator', 'manager'])
  const pumpId = String(params.id || '').trim()
  if (!pumpId) return notFound()

  const pump = await queryOne<Record<string, unknown>>(
    `SELECT id,
            code,
            name,
            status,
            has_nozzle_selector,
            pump_number
       FROM pumps
      WHERE id = $1 AND station_id = $2`,
    [pumpId, user.stationId],
  )

  if (!pump) return notFound()

  return (
    <div className="space-y-4">
      <PumpDetailClient
        stationId={user.stationId}
        pump={{
          id: String(pump.id),
          code: String(pump.code ?? ''),
          name: String(pump.name ?? ''),
          status: String(pump.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE',
          hasNozzleSelector: Boolean(pump.has_nozzle_selector),
          pumpNumber: Number(pump.pump_number ?? 0),
        }}
      />
    </div>
  )
}

export default SettingsPumpDetailPage
