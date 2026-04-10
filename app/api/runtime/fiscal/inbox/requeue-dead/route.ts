import { badRequest, ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { requeueDeadFiscalMessages } from '@/src/modules/fiscal-inbox/application/commands'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<any>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    const stationId = String(body?.stationId ?? user.stationId ?? '').trim()
    if (!stationId) return badRequest('Missing stationId')

    let ids: number[] | [] | null = null
    if (Array.isArray(body?.ids)) {
      const parsedIds = body.ids
        .map((n: unknown) => Number(n))
        .filter((n: number) => Number.isFinite(n))
      if (parsedIds.length === 0) {
        return badRequest('ids was provided but empty/invalid')
      }
      ids = parsedIds
    }

    const result = await requeueDeadFiscalMessages({ stationId, ids })
    return ok(result)
  },
})
