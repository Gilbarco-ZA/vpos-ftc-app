import { fail } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['administrator'],
  handler: async () =>
    fail(
      'Legacy Azure SQL station synchronization is retired. vpos-proxy owns cloud delivery.',
      410,
    ),
})
