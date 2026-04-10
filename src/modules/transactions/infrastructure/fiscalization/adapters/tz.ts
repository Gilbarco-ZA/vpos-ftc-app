import crypto from 'crypto'

import { getSecureArtifactPayload } from '@/src/platform/security/secure-artifacts'

import type {
  FiscalAdapter,
  FiscalizationRequest,
  FiscalRunResult,
} from './types'

function assertEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not configured`)
  return v
}

export const tzAdapter: FiscalAdapter = {
  engine: 'TZ',
  async run(req: FiscalizationRequest): Promise<FiscalRunResult> {
    // Minimal, production-safe adapter skeleton:
    // - loads cert material from secure_artifacts (if present) for future mTLS usage
    // - calls a station-independent HTTP endpoint if configured (TZ_FISCAL_ENDPOINT)
    // You can swap this implementation to your real TZ engine client.

    let certData: Buffer | null = null
    let certPass: Buffer | null = null
    try {
      certData = await getSecureArtifactPayload(
        req.stationId,
        'vpos.cert',
        'data',
      )
    } catch {}
    try {
      certPass = await getSecureArtifactPayload(
        req.stationId,
        'vpos.cert',
        'passphrase',
      )
    } catch {}

    const endpoint = assertEnv('TZ_FISCAL_ENDPOINT')

    const requestPayload = {
      stationId: req.stationId,
      transaction: req.transaction,
      customer: req.customer
        ? {
            tin: req.customer.tin ?? null,
            buyer_name: req.customer.buyer_name ?? null,
          }
        : null,
      // Not used yet, but kept for traceability
      cert_present: !!certData,
      cert_passphrase_present: !!certPass,
    }

    try {
      const idempotencyKey =
        String(
          (req.transaction &&
            (req.transaction.id ||
              req.transaction.source_queue_id ||
              req.transaction.sourceQueueId)) ||
            '',
        ) ||
        crypto
          .createHash('sha256')
          .update(JSON.stringify(requestPayload))
          .digest('hex')

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(requestPayload),
      })

      const raw = await resp.text()
      if (!resp.ok) {
        return {
          status: 'FAILED',
          rawResponse: raw,
          engine: 'TZ',
          requestPayload,
          errorMessage: `TZ fiscal endpoint returned ${resp.status}`,
        }
      }

      let parsed: any = null
      try {
        parsed = JSON.parse(raw)
      } catch {}
      const reference =
        parsed?.reference ||
        parsed?.data?.reference ||
        parsed?.fiscalization_reference

      return {
        status: 'SUCCESS',
        reference: reference ? String(reference) : undefined,
        rawResponse: raw,
        engine: 'TZ',
        requestPayload,
        responsePayload: parsed ?? raw,
      }
    } catch (e: any) {
      return {
        status: 'FAILED',
        rawResponse: JSON.stringify({
          ok: false,
          error: String(e?.message || e),
        }),
        engine: 'TZ',
        requestPayload,
        errorMessage: String(e?.message || e),
      }
    }
  },
}
