import { listDeviceConfigs } from '@/src/shared/config/pluginDevice'
import { KV_KEYS } from '@/src/shared/setup/api'
import { getSiteProfile } from '@/src/shared/setup/siteProfile'
import { kvGet } from '@/src/shared/storage/stationKv'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { listProducts } from '@/src/modules/products/application/queries/list-products'
import { getPumpRuntimeState } from '@/src/modules/pumps/application/getPumpRuntimeState'
import { getTankSettings } from '@/src/modules/settings/application/getTankSettings'

import { getSetupStatusPayload } from './getSetupStatusPayload'

type SetupStatusPayload = Awaited<ReturnType<typeof getSetupStatusPayload>>
type BaseFlagsData = SetupStatusPayload['flags']['data']
type TankSettings = Awaited<ReturnType<typeof getTankSettings>>
type PumpStatePayload = Awaited<ReturnType<typeof getPumpRuntimeState>>

type AdminSetupFlags = {
  success: boolean
  data: BaseFlagsData & {
    siteProfileConfigured: boolean
    tanksConfigured: boolean
    productsConfigured: boolean
    printerConfigured: boolean
    pumpsConfigured: boolean
  }
}

export type AdminSetupCurrentPayload = {
  success: true
  stationId: string
  siteProfile: Awaited<ReturnType<typeof getSiteProfile>>
  flags: AdminSetupFlags
  status: SetupStatusPayload['status']
  tanks:
    | (TankSettings & {
        grades: string[]
        activeTanks: string[]
      })
    | null
  products: { count: number }
  printer: { configured: boolean; configs: any[] }
  pumps: PumpStatePayload
  setupStep: string | null
  setupUpdatedAt: string | null
  setupComplete: boolean
}

export async function getAdminSetupCurrent(
  stationId: string,
): Promise<AdminSetupCurrentPayload> {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')

  const [
    setup,
    siteProfile,
    tankSettings,
    productList,
    deviceConfigs,
    pumps,
    setupStep,
    setupUpdatedAt,
    setupComplete,
  ] = await Promise.all([
    getSetupStatusPayload(normalizedStationId),
    getSiteProfile(normalizedStationId),
    getTankSettings(normalizedStationId),
    listProducts({ stationId: normalizedStationId }),
    listDeviceConfigs(normalizedStationId),
    getPumpRuntimeState(normalizedStationId),
    kvGet<string>(normalizedStationId, KV_KEYS.SETUP_STEP),
    kvGet<string>(normalizedStationId, KV_KEYS.SETUP_UPDATED_AT),
    kvGet<boolean>(normalizedStationId, KV_KEYS.SETUP_COMPLETE),
  ])

  const printerConfigs = (deviceConfigs || []).filter((row: any) => {
    const deviceType = String(row?.device_type ?? row?.deviceType ?? '').trim()
    const enabled = row?.enabled !== false
    return deviceType === 'printer' && enabled
  })

  const activeTanks = (tankSettings?.tanks || [])
    .map((tank: any) => String(tank?.id || '').trim())
    .filter(Boolean)

  const grades = Array.from(
    new Set(
      (tankSettings?.tanks || [])
        .map((tank: any) =>
          String(tank?.productExternalId || tank?.productId || '').trim(),
        )
        .filter(Boolean),
    ),
  )

  const tanks =
    activeTanks.length > 0
      ? {
          ...tankSettings,
          grades,
          activeTanks,
        }
      : null

  const flagsData: AdminSetupFlags['data'] = {
    ...(setup.flags?.data ?? {
      deviceRegistered: false,
      usersConfigured: false,
    }),
    siteProfileConfigured: Boolean(siteProfile),
    tanksConfigured: Boolean(tanks),
    productsConfigured: (productList?.length ?? 0) > 0,
    printerConfigured: printerConfigs.length > 0,
    pumpsConfigured: Boolean(pumps?.config),
  }

  return {
    success: true,
    stationId: normalizedStationId,
    siteProfile,
    flags: {
      success: Object.values(flagsData).every(Boolean),
      data: flagsData,
    },
    status: setup.status,
    tanks,
    products: { count: productList?.length ?? 0 },
    printer: {
      configured: printerConfigs.length > 0,
      configs: printerConfigs,
    },
    pumps,
    setupStep: typeof setupStep === 'string' ? setupStep : null,
    setupUpdatedAt: typeof setupUpdatedAt === 'string' ? setupUpdatedAt : null,
    setupComplete:
      Boolean(setupComplete) ||
      (typeof setupStep === 'string' && setupStep === 'finalized'),
  }
}
