import { queryOne } from '@/src/platform/db/postgres'

import {
  getTanzaniaDailyTotalsScheduleConfig,
  listTanzaniaDailyTotalSubmissions,
  setTanzaniaDailyTotalsSendTime,
} from '../infrastructure/dailyTotalsStore'
import { previousClosedBusinessDate } from '../infrastructure/proxyDailyTotals'
import { forceSendTanzaniaDailyTotal } from '../infrastructure/proxyDailyTotalsWorker'
import { assertStationIsTanzania } from './country'

export async function getTanzaniaDailyTotalsDashboard(stationId: string, page = 1, pageSize = 50) {
  await assertStationIsTanzania(stationId)
  const safePageSize = [10, 25, 50, 100].includes(pageSize) ? pageSize : 50
  const safePage = Math.max(1, Math.trunc(page))
  const [schedule, submissions, counted] = await Promise.all([
    getTanzaniaDailyTotalsScheduleConfig(stationId),
    listTanzaniaDailyTotalSubmissions(stationId, safePageSize, (safePage - 1) * safePageSize),
    queryOne<{ total: string }>('SELECT COUNT(*)::text AS total FROM tanzania_daily_total_submissions WHERE station_id = $1::uuid', [stationId]),
  ])

  return {
    timezone: schedule.timezone,
    sendTime: schedule.sendTime,
    latestClosedBusinessDate: previousClosedBusinessDate(
      new Date(),
      schedule.timezone,
    ),
    submissions,
    total: Number(counted?.total ?? 0),
    page: safePage,
    pageSize: safePageSize,
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
