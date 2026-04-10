import { badRequest, ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { bulkManageFiscalInbox } from '@/src/modules/fiscal-inbox/application/commands'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseIds(input: unknown) {
  if (!Array.isArray(input) || input.length === 0) return null
  const ids = input.map((n) => Number(n)).filter((n) => Number.isFinite(n))
  return ids.length ? ids : []
}

export const POST = defineMutationRoute<any>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { body }) => {
    const ids = parseIds(body?.ids)
    if (ids === null) return badRequest('ids[] is required')
    if (ids.length === 0) return badRequest('ids[] must contain numbers')

    const action = String(body?.action ?? '').toUpperCase() as any
    if (
      ![
        'REQUEUE',
        'MARK_FAILED',
        'MARK_DEAD',
        'MARK_PROCESSED',
        'DELETE',
      ].includes(action)
    ) {
      return badRequest('Unknown action')
    }

    const stationId =
      typeof body?.stationId === 'string' ? body.stationId : null
    const errorText =
      typeof body?.errorText === 'string' ? body.errorText : null
    const result = await bulkManageFiscalInbox({
      ids,
      stationId,
      action,
      errorText,
    })
    return ok(result)
  },
})
