import { fail, ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { publishRuntimeBusMessage } from '@/src/modules/runtime/application/publishRuntimeBusMessage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { body }) => {
    const payload = body || {}
    const result = await publishRuntimeBusMessage({
      topic: String((payload as any).topic || ''),
      message: (payload as any).message,
    })
    if (!result.ok) return fail('Publish failed')
    return ok(result)
  },
})
