import { listCatalogPluginsRepo } from '@/src/modules/admin-config/infrastructure/adminPluginCatalogRepo'

export async function getAdminPluginCatalogStatus() {
  const registeredPlugins = await listCatalogPluginsRepo()
  return {
    plugins: {},
    registeredPlugins,
  }
}
