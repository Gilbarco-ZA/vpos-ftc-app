import { getAtgPollingSettings } from '@/src/modules/forecourt/application/atgPollingSettings'
import { resolveTankGroups } from '@/src/modules/forecourt/application/tankGauge'
import {
  listProductsRepo,
  listTanksRepo,
} from '@/src/modules/settings/infrastructure/settingsRepo'

export async function getTankSettings(stationId: string) {
  const [tanks, products, tankGroups, atgPolling] = await Promise.all([
    listTanksRepo(stationId),
    listProductsRepo(stationId),
    resolveTankGroups(stationId),
    getAtgPollingSettings(stationId),
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
      liveTcVolumeLitres:
        row.live_tc_volume_litres === null ||
        row.live_tc_volume_litres === undefined
          ? null
          : Number(row.live_tc_volume_litres),
      liveTemperatureC:
        row.live_temperature_c === null || row.live_temperature_c === undefined
          ? null
          : Number(row.live_temperature_c),
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
      atgProductLevelMm:
        row.atg_product_level === null || row.atg_product_level === undefined
          ? null
          : Number(row.atg_product_level),
      atgWaterLevelMm:
        row.atg_water_level === null || row.atg_water_level === undefined
          ? null
          : Number(row.atg_water_level),
      atgWaterVolumeLitres:
        row.atg_water_volume_litres === null ||
        row.atg_water_volume_litres === undefined
          ? null
          : Number(row.atg_water_volume_litres),
      atgAvailableRoomLitres:
        row.atg_available_room_litres === null ||
        row.atg_available_room_litres === undefined
          ? null
          : Number(row.atg_available_room_litres),
      atgGaugeOnline:
        row.atg_gauge_online === null || row.atg_gauge_online === undefined
          ? null
          : Boolean(row.atg_gauge_online),
      atgInventoryDataReady:
        row.atg_inventory_data_ready === null ||
        row.atg_inventory_data_ready === undefined
          ? null
          : Boolean(row.atg_inventory_data_ready),
      atgGaugeAlarmActive:
        row.atg_gauge_alarm_active === null ||
        row.atg_gauge_alarm_active === undefined
          ? null
          : Boolean(row.atg_gauge_alarm_active),
      atgGaugeErrorActive:
        row.atg_gauge_error_active === null ||
        row.atg_gauge_error_active === undefined
          ? null
          : Boolean(row.atg_gauge_error_active),
      atgControllerUpdatedAt: row.atg_controller_updated_at
        ? new Date(String(row.atg_controller_updated_at)).toISOString()
        : null,
      atgCapturedAt: row.atg_captured_at
        ? new Date(String(row.atg_captured_at)).toISOString()
        : null,
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
    atgPolling,
  }
}
