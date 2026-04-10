import { listStationConfigDefaultsRepo } from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

export async function listAdminConfigDefaults() {
  const defaults = await listStationConfigDefaultsRepo()
  return Array.isArray(defaults) ? defaults.filter(Boolean) : []
}
