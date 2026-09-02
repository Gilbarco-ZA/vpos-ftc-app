import { readTanzaniaFiscalConfig } from '@/src/modules/tanzania-fiscal/infrastructure/config'
import { assertStationIsTanzania } from '@/src/modules/tanzania-fiscal/infrastructure/country'
import { sendEwuraSalesTransactionFromDb } from '@/src/modules/tanzania-fiscal/infrastructure/ewura'
import { getEwuraPartialFiscalizationPolicy } from '@/src/modules/tanzania-fiscal/infrastructure/ewuraRetry'
import { sendTraReceiptFromDb } from '@/src/modules/tanzania-fiscal/infrastructure/tra'

import type {
  FiscalAdapter,
  FiscalizationRequest,
  FiscalRunResult,
} from './types'

export const tzAdapter: FiscalAdapter = {
  engine: 'TZ',
  async run(req: FiscalizationRequest): Promise<FiscalRunResult> {
    const requestPayload: Record<string, any> = {
      stationId: req.stationId,
      transactionId: req.transaction?.id ?? null,
    }

    try {
      await assertStationIsTanzania(req.stationId)

      const tra = await sendTraReceiptFromDb({
        stationId: req.stationId,
        transaction: req.transaction,
        customer: req.customer,
      })

      requestPayload.tra = tra.request

      if (!tra.ok) {
        const responsePayload = {
          ...tra.response,
          verificationUrl: tra.verificationUrl ?? null,
        }
        return {
          status: 'FAILED',
          engine: 'TZ',
          reference: tra.reference ?? undefined,
          rawResponse: JSON.stringify({
            localTanzania: {
              engine: 'TZ',
              route: 'local_tz',
              reference: tra.reference ?? null,
              tra: {
                request: tra.request,
                response: responsePayload,
                rawResponse: tra.rawResponse,
              },
              status: 'FAILED',
            },
          }),
          requestPayload,
          responsePayload,
          errorMessage:
            tra.error || `TRA fiscalization failed (${tra.httpStatus})`,
        }
      }

      const tanzaniaConfig = await readTanzaniaFiscalConfig(req.stationId)
      let ewura: any = null
      try {
        ewura = await sendEwuraSalesTransactionFromDb({
          stationId: req.stationId,
          transaction: req.transaction,
          customer: req.customer,
          traRequest: tra.request,
        })
      } catch (e: any) {
        // TRA receipt fiscalization remains successful. The EWURA DB row is either
        // already marked FAILED by the sender or the error is preserved here for audit.
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

      const rawResponse = JSON.stringify({
        localTanzania: {
          engine: 'TZ',
          route: 'local_tz',
          reference: tra.reference ?? null,
          tra: {
            request: tra.request,
            response: commonResponse.tra,
            rawResponse: tra.rawResponse,
          },
          ewura,
          tanzaniaFiscalizationState: ewuraPolicy.fiscalizationState,
          ewuraFailureMode: ewuraPolicy.failureMode,
          ewuraAuditMessage: ewuraPolicy.auditMessage,
          status: ewuraPolicy.blockTransaction ? 'FAILED' : 'SUCCESS',
        },
      })

      if (ewuraPolicy.blockTransaction) {
        return {
          status: 'FAILED',
          engine: 'TZ',
          reference: tra.reference ?? undefined,
          rawResponse,
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
        rawResponse,
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
  },
}
