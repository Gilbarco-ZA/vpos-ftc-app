import type {
  ReportRequest,
  ReportResult,
} from '@/src/modules/reports/infrastructure/reportTypes'

import { assertStationIsTanzania } from '@/src/modules/tanzania-fiscal/infrastructure/country'
import { sendEwuraInventoryReportFromDb } from '@/src/modules/tanzania-fiscal/infrastructure/ewura'

import type { ReportsAdapter } from './types'

export class TzReportsAdapter implements ReportsAdapter {
  async generateReport(req: ReportRequest): Promise<ReportResult> {
    try {
      await assertStationIsTanzania(req.stationId)
      return await sendEwuraInventoryReportFromDb({
        stationId: req.stationId,
        payload: req.payload,
        sourceQueueId: req.sourceQueueId ?? null,
      })
    } catch (e: any) {
      const error = String(e?.message || e)
      return {
        ok: false,
        error,
        retryable: !/only available for Tanzania stations/i.test(error),
      }
    }
  }
}
