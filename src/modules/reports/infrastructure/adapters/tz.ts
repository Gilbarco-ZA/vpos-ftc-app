import crypto from 'crypto'
import type {
  ReportRequest,
  ReportResult,
} from '@/src/modules/reports/infrastructure/reportTypes'

import { getSecureArtifactPayload } from '@/src/platform/security/secure-artifacts'

import type { ReportsAdapter } from './types'

/**
 * TZ reports adapter.
 *
 * This is intentionally conservative: it does an HTTP POST to a configurable endpoint.
 * If your TZ fiscal service expects a different payload/route, adjust here.
 */
export class TzReportsAdapter implements ReportsAdapter {
  async generateReport(req: ReportRequest): Promise<ReportResult> {
    const base = process.env.TZ_FISCAL_ENDPOINT
    const endpoint =
      process.env.TZ_REPORT_ENDPOINT ??
      (base ? `${base.replace(/\/$/, '')}/reports` : null)

    if (!endpoint) {
      return {
        ok: false,
        error: 'TZ_REPORT_ENDPOINT or TZ_FISCAL_ENDPOINT is not set',
        retryable: false,
      }
    }

    // Load cert/passphrase if stored; not used yet but kept for traceability.
    try {
      await getSecureArtifactPayload(req.stationId, 'vpos.cert', 'data')
    } catch {}
    try {
      await getSecureArtifactPayload(req.stationId, 'vpos.cert', 'passphrase')
    } catch {}

    const idempotencyKey =
      String(req.sourceQueueId ?? req.payload?.transactionId ?? '') ||
      crypto
        .createHash('sha256')
        .update(JSON.stringify(req.payload ?? {}))
        .digest('hex')

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          stationId: req.stationId,
          reportType:
            req.reportType ??
            req.payload?.report_type ??
            req.payload?.type ??
            'UNKNOWN',
          payload: req.payload,
        }),
      })

      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        // treat 4xx as non-retryable by default
        const retryable = res.status >= 500 || res.status === 429
        return {
          ok: false,
          error: `TZ report failed (${res.status}): ${txt}`.trim(),
          retryable,
        }
      }

      const json: any = await res.json().catch(() => ({}))
      return {
        ok: true,
        reportType:
          json.reportType ??
          req.reportType ??
          req.payload?.report_type ??
          req.payload?.type ??
          'UNKNOWN',
        reportDateTime:
          json.reportDateTime ??
          json.report_date_time ??
          new Date().toISOString(),
        payload: json.payload ?? json,
        reference: json.reference ?? json.ref ?? null,
      }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e), retryable: true }
    }
  }
}
