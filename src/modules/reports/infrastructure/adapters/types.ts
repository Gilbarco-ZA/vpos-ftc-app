import type {
  ReportRequest,
  ReportResult,
} from '@/src/modules/reports/infrastructure/reportTypes'

export interface ReportsAdapter {
  generateReport(req: ReportRequest): Promise<ReportResult>
}
