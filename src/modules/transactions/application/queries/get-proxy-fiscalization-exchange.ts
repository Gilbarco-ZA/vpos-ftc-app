import {
  normalizeFiscalPayload,
  sanitizeFiscalText,
} from '@/src/modules/transactions/domain/fiscalization-event'
import { getProxyFiscalizationExchangeRepo } from '@/src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository'

export async function getProxyFiscalizationExchangeQuery(input: {
  stationId: string
  transactionId: string
  eventId?: string | null
}) {
  const event = await getProxyFiscalizationExchangeRepo(input)
  if (!event) return null

  return {
    eventId: event.id,
    engine: event.engine,
    transport: event.transport,
    status: event.status,
    occurredAt:
      event.occurred_at instanceof Date
        ? event.occurred_at.toISOString()
        : String(event.occurred_at),
    matchType: input.eventId ? 'inbox-event' : 'latest-transaction-attempt',
    // Old/imported evidence may not match the actual proxy wire format.
    // Runtime submissions now record the JSON body at the HTTP boundary.
    requestPayload: normalizeFiscalPayload(event.request_payload),
    responsePayload: normalizeFiscalPayload(event.response_payload),
    errorMessage: event.error_message
      ? sanitizeFiscalText(event.error_message)
      : null,
  }
}
