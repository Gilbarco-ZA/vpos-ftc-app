import type { FiscalRunResult } from '@/src/modules/transactions/infrastructure/fiscalization/adapters/types'

import { readTanzaniaFiscalConfig } from '@/src/modules/tanzania-fiscal/infrastructure/config'
import { sendEwuraCreditNoteFromDb } from '@/src/modules/tanzania-fiscal/infrastructure/ewura'
import { getEwuraPartialFiscalizationPolicy } from '@/src/modules/tanzania-fiscal/infrastructure/ewuraRetry'
import { assertLocalTanzaniaFiscalizationRoute } from '@/src/modules/tanzania-fiscal/infrastructure/route'
import { sendTraCreditNoteFromDb } from '@/src/modules/tanzania-fiscal/infrastructure/tra'

export type CreditNoteFiscalizationRequest = {
  stationId: string
  transaction: any
  customer: any | null
  creditNote: any
}

/**
 * Fiscalizes a Tanzania credit note through the in-app local TZ path.
 *
 * Credit notes intentionally do not use the normal sales transaction adapter
 * because receipt counters and EWURA queue anchors must be independent from the
 * original sale. The station DB route remains the safety switch that decides
 * whether this code path is allowed to run.
 */
export async function runCreditNoteFiscalization(
  req: CreditNoteFiscalizationRequest,
): Promise<FiscalRunResult> {
  const requestPayload: Record<string, any> = {
    stationId: req.stationId,
    transactionId: req.transaction?.id ?? null,
    creditNoteId: req.creditNote?.id ?? null,
  }

  try {
    await assertLocalTanzaniaFiscalizationRoute(req.stationId)

    const tra = await sendTraCreditNoteFromDb({
      stationId: req.stationId,
      transaction: req.transaction,
      customer: req.customer,
      creditNote: req.creditNote,
    })

    requestPayload.tra = tra.request

    if (!tra.ok) {
      return {
        status: 'FAILED',
        engine: 'TZ',
        reference: tra.reference ?? undefined,
        rawResponse: tra.rawResponse,
        requestPayload,
        responsePayload: {
          ...tra.response,
          verificationUrl: tra.verificationUrl ?? null,
        },
        errorMessage:
          tra.error ||
          `TRA credit note fiscalization failed (${tra.httpStatus})`,
      }
    }

    const tanzaniaConfig = await readTanzaniaFiscalConfig(req.stationId)
    let ewura: any = null
    try {
      ewura = await sendEwuraCreditNoteFromDb({
        stationId: req.stationId,
        transaction: req.transaction,
        customer: req.customer,
        creditNote: req.creditNote,
        traRequest: tra.request,
      })
    } catch (e: any) {
      ewura = {
        ok: false,
        error: String(e?.message || e),
      }
    }

    const ewuraPolicy = getEwuraPartialFiscalizationPolicy({
      failureMode: tanzaniaConfig.ewura.failureMode,
      ewuraOk: !!ewura?.ok,
    })

    const commonResponse = {
      tra: {
        ...tra.response,
        verificationUrl: tra.verificationUrl ?? null,
      },
      ewura,
      tanzaniaFiscalizationState: ewuraPolicy.fiscalizationState,
      ewuraFailureMode: ewuraPolicy.failureMode,
      ewuraAuditMessage: ewuraPolicy.auditMessage,
    }

    if (ewuraPolicy.blockTransaction) {
      return {
        status: 'FAILED',
        engine: 'TZ',
        reference: tra.reference ?? undefined,
        rawResponse: JSON.stringify(commonResponse),
        requestPayload: {
          ...requestPayload,
          ewura: ewura?.requestPayload ?? null,
        },
        responsePayload: commonResponse,
        errorMessage: ewura?.error || ewuraPolicy.auditMessage,
      }
    }

    return {
      status: ewuraPolicy.responseStatus,
      engine: 'TZ',
      reference: tra.reference ?? undefined,
      rawResponse: JSON.stringify(commonResponse),
      requestPayload: {
        ...requestPayload,
        ewura: ewura?.requestPayload ?? null,
      },
      responsePayload: commonResponse,
    }
  } catch (e: any) {
    return {
      status: 'FAILED',
      engine: 'TZ',
      rawResponse: JSON.stringify({
        ok: false,
        error: String(e?.message || e),
      }),
      requestPayload,
      errorMessage: String(e?.message || e),
    }
  }
}
