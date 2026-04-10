import { resolveTankGroups } from '@/src/shared/doms/tankGauge'

import {
  listProductsRepo,
  listTanksRepo,
} from '@/src/modules/settings/infrastructure/settingsRepo'

export async function getTankSettings(stationId: string) {
  const [tanks, products, tankGroups] = await Promise.all([
    listTanksRepo(stationId),
    listProductsRepo(stationId),
    resolveTankGroups(stationId),
  ])

  return {
    tanks: tanks.map((row) => ({
      id: String(row.id),
      code: String(row.code ?? ''),
      name: String(row.name ?? ''),
      status: String(row.status ?? 'ACTIVE'),
      productId: String(row.product_id ?? ''),
      productExternalId: String((row as any).product_external_id ?? ''),
      productName: String(row.product_name ?? ''),
      productCode: String(row.product_code ?? ''),
      capacityLitres: Number(row.capacity_litres ?? 0),
      lowLevelLitres:
        row.low_level_litres === null || row.low_level_litres === undefined
          ? null
          : Number(row.low_level_litres),
      criticalLevelLitres:
        row.critical_level_litres === null ||
        row.critical_level_litres === undefined
          ? null
          : Number(row.critical_level_litres),
      tankGroupId: row.tank_group_id ? String(row.tank_group_id) : '',
      tankGroupName: String(row.tank_group_name ?? ''),
      domsTankId: String(row.doms_tank_id ?? ''),
      liveVolumeLitres:
        row.live_volume_litres === null || row.live_volume_litres === undefined
          ? null
          : Number(row.live_volume_litres),
      liveVolumeUpdatedAt: row.live_volume_updated_at
        ? new Date(String(row.live_volume_updated_at)).toISOString()
        : null,
      manualVolumeLitres:
        row.manual_volume_litres === null ||
        row.manual_volume_litres === undefined
          ? null
          : Number(row.manual_volume_litres),
      manualVolumeRecordedAt: row.manual_volume_recorded_at
        ? new Date(String(row.manual_volume_recorded_at)).toISOString()
        : null,
      manualVolumeRecordedBy: String(row.manual_volume_recorded_by ?? ''),
    })),
    products: products.map((row) => ({
      id: String(row.id ?? ''),
      name: String(row.product_name ?? ''),
      code: String(row.product_code ?? ''),
    })),
    tankGroups: tankGroups.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
    })),
  }
}
