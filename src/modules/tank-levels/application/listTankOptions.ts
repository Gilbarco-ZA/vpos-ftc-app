import {
  listTankInventoryMovementsRepo,
  listTankOptionsRepo,
} from '@/src/modules/tank-levels/infrastructure/tankLevelsRepo'

export async function listTankOptions(stationId: string) {
  return await listTankOptionsRepo(stationId)
}
export async function listTankInventoryMovements(
  stationId: string,
  _limit?: number,
) {
  return await listTankInventoryMovementsRepo(stationId)
}
