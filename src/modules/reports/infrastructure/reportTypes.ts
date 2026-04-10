export type ReportRequest = {
  stationId: string
  /** freeform request payload coming from POS / console */
  payload: any
  /** Optional report type hint (e.g. 'X', 'Z', 'DAILY', etc.) */
  reportType?: string | null
  /** Idempotency anchor (usually report_queue.id) */
  sourceQueueId?: string | null
}

export type ReportResult =
  | {
      ok: true
      reportType: string
      reportDateTime: string // ISO
      payload: any
      /** optional external reference */
      reference?: string | null
    }
  | {
      ok: false
      error: string
      retryable?: boolean
    }
