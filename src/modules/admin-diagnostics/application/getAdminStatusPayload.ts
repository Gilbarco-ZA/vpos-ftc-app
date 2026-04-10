import { getAdminStatus } from '@/src/modules/admin-diagnostics/application/getAdminStatus'

export async function getAdminStatusPayload(stationId: string) {
  return await getAdminStatus(stationId)
}
