import { logger } from '@/src/shared/utils/logger'

import {
  getStationCountryCode,
  isTanzaniaCountry,
} from '@/src/modules/tanzania-fiscal/infrastructure/country'
import { enqueueAutoPrintFiscalReceipt } from './autoPrintFiscalReceipt'
import { isOfflineProxySubmission } from './proxyOfflineSubmission'

export async function maybeEnqueueOfflineFiscalReceipt(input: {
  stationId: string
  transactionId: string
  responsePayload: unknown
}) {
  if (!isOfflineProxySubmission(input.responsePayload)) return null

  const country = await getStationCountryCode(input.stationId)
  if (!isTanzaniaCountry(country)) return null

  try {
    const result = await enqueueAutoPrintFiscalReceipt({
      stationId: input.stationId,
      transactionId: input.transactionId,
      offlinePrint: true,
    })

    logger.info('[offlineFiscalReceipt]', {
      stationId: input.stationId,
      transactionId: input.transactionId,
      autoPrintEnabled: result.enabled,
      autoPrintEnqueued: result.enqueued,
      printJobId: result.printJobId,
    })

    return result
  } catch (error: any) {
    logger.error('[offlineFiscalReceipt] enqueue failed', {
      stationId: input.stationId,
      transactionId: input.transactionId,
      error: String(error?.message || error),
    })
    return null
  }
}
