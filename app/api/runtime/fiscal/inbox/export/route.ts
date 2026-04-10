import { badRequest } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { exportFiscalInboxQuery } from '@/src/modules/fiscal-inbox/application/queries'

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
    const stationId =
      typeof body?.stationId === 'string' ? body.stationId : null
    return exportFiscalInboxQuery({ ids, stationId, format: 'json' })
  },
})
