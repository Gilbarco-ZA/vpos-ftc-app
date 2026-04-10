import type {
  ReportRequest,
  ReportResult,
} from '@/src/modules/reports/infrastructure/reportTypes'

import type { ReportsAdapter } from './types'

export class MockReportsAdapter implements ReportsAdapter {
  async generateReport(req: ReportRequest): Promise<ReportResult> {
    const reportType =
      req.reportType ??
      req.payload?.report_type ??
      req.payload?.type ??
      'UNKNOWN'
    return {
      ok: true,
      reportType,
      reportDateTime: new Date().toISOString(),
      payload: {
        ...req.payload,
        generatedBy: 'mock',
        stationId: req.stationId,
      },
    }
  }
}
