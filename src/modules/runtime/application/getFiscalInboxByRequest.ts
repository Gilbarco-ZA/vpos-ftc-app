import { badRequest } from '@/src/platform/web/api/response'

import { findFiscalInboxByRequest } from '@/src/modules/runtime/application/findFiscalInboxByRequest'
import { jumpToFiscalInboxRequest } from '@/src/modules/runtime/application/jumpToFiscalInboxRequest'

export async function getFiscalInboxByRequest(
  searchParams: URLSearchParams,
  defaultStationId?: string | null,
) {
  const requestId = String(searchParams.get('requestId') || '').trim()
  if (!requestId) return badRequest('requestId is required')

  const stationId =
    String(searchParams.get('stationId') || defaultStationId || '').trim() ||
    null
  return findFiscalInboxByRequest({ requestId, stationId })
}

export async function getFiscalInboxJumpTarget(
  searchParams: URLSearchParams,
  defaultStationId?: string | null,
) {
  const requestId = String(searchParams.get('requestId') || '').trim()
  if (!requestId) return badRequest('requestId is required')

  const stationId =
    String(searchParams.get('stationId') || defaultStationId || '').trim() ||
    null
  return jumpToFiscalInboxRequest({ requestId, stationId })
}
