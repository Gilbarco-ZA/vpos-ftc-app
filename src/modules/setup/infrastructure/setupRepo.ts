import {
  getSetupFlags as sharedGetSetupFlags,
  getStationKv as sharedGetStationKv,
  storeStationKv as sharedStoreStationKv,
} from '@/src/shared/setup/api'
import {
  getPumpsConfigFromDb as sharedGetPumpsConfigFromDb,
  syncForecourtFromPumpsConfig as sharedSyncForecourtFromPumpsConfig,
} from '@/src/shared/setup/forecourtSync'
import {
  getSiteProfile as sharedGetSiteProfile,
  saveSiteProfile as sharedSaveSiteProfile,
} from '@/src/shared/setup/siteProfile'

export async function getSetupFlags(stationId: string) {
  return await sharedGetSetupFlags(stationId)
}

export async function storeStationKv(
  stationId: string,
  key: string,
  value: unknown,
) {
  return await sharedStoreStationKv(stationId, key, value)
}

export async function getStationKv<T = unknown>(
  stationId: string,
  key: string,
) {
  return await sharedGetStationKv<T>(stationId, key)
}

export async function getSiteProfile(stationId: string) {
  return await sharedGetSiteProfile(stationId)
}

export async function saveSiteProfile(
  stationId: string,
  profile: Record<string, unknown>,
) {
  return await sharedSaveSiteProfile(stationId, profile)
}

export async function getPumpsConfigFromDb(stationId: string) {
  return await sharedGetPumpsConfigFromDb(stationId)
}

export async function syncForecourtFromPumpsConfig(
  stationId: string,
  pumps: unknown[],
) {
  return await sharedSyncForecourtFromPumpsConfig(stationId, pumps as any)
}
