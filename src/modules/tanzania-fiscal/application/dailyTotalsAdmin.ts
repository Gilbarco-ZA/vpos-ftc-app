import {
  getTanzaniaDailyTotalsScheduleConfig,
  listTanzaniaDailyTotalSubmissions,
  setTanzaniaDailyTotalsSendTime,
} from '../infrastructure/dailyTotalsStore'
import { previousClosedBusinessDate } from '../infrastructure/proxyDailyTotals'
import { forceSendTanzaniaDailyTotal } from '../infrastructure/proxyDailyTotalsWorker'
import { assertStationIsTanzania } from './country'

export async function getTanzaniaDailyTotalsDashboard(stationId: string) {
  await assertStationIsTanzania(stationId)
  const [schedule, submissions] = await Promise.all([
    getTanzaniaDailyTotalsScheduleConfig(stationId),
    listTanzaniaDailyTotalSubmissions(stationId),
  ])

  return {
    timezone: schedule.timezone,
    sendTime: schedule.sendTime,
    latestClosedBusinessDate: previousClosedBusinessDate(
      new Date(),
      schedule.timezone,
    ),
    submissions,
  }
}

export async function updateTanzaniaDailyTotalsSchedule(
  stationId: string,
  sendTime: unknown,
) {
  await assertStationIsTanzania(stationId)
  return await setTanzaniaDailyTotalsSendTime(stationId, sendTime)
}

export async function forceTanzaniaDailyTotalSubmission(
  stationId: string,
  businessDate?: string | null,
) {
  await assertStationIsTanzania(stationId)
  return await forceSendTanzaniaDailyTotal(stationId, businessDate)
}
