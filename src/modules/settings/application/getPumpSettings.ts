import { resolveTankGroups } from '@/src/shared/doms/tankGauge'

import { listPumpsRepo } from '@/src/modules/settings/infrastructure/settingsRepo'

export async function getPumpSettings(stationId: string) {
  const [pumps, tankGroups] = await Promise.all([
    listPumpsRepo(stationId),
    resolveTankGroups(stationId),
  ])

  return {
    pumps: pumps.map((row) => ({
      id: String(row.id),
      code: String(row.code ?? ''),
      name: String(row.name ?? ''),
      status: String(row.status ?? 'ACTIVE'),
      hasNozzleSelector: Boolean(row.has_nozzle_selector),
      pumpNumber: Number(row.pump_number ?? 0),
      tankGroupId: row.tank_group_id ? String(row.tank_group_id) : '',
      tankGroupName: String(row.tank_group_name ?? ''),
    })),
    tankGroups: tankGroups.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
    })),
  }
}
