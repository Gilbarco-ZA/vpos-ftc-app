import {
  getFuelPricePollingSettings,
  updateFuelPricePollingSettings,
} from '@/src/modules/forecourt/application/fuelPricePollingSettings'
import {
  getFuelPricePollStatus,
  pollFuelPriceChangesOnce,
} from '@/src/modules/forecourt/infrastructure/fuelPriceChangeWorker'

export async function getFuelPricePollingOverview(stationId: string) {
  const [settings, lastPoll] = await Promise.all([
    getFuelPricePollingSettings(stationId),
    getFuelPricePollStatus(stationId),
  ])

  return { ...settings, lastPoll }
}

export async function setFuelPricePollingEnabled(
  stationId: string,
  enabled: boolean,
) {
  return await updateFuelPricePollingSettings(stationId, { enabled })
}

export async function checkFuelPricesNow(stationId: string) {
  const result = await pollFuelPriceChangesOnce(stationId)
  const lastPoll = await getFuelPricePollStatus(stationId)
  return { result, lastPoll }
}
