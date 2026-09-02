import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async () =>
    ok({
      retired: true,
      owner: 'vpos-proxy',
      message:
        'Legacy Azure SQL station synchronization is retired. Cloud-bound operational data is delivered through vpos-proxy.',
    }),
})
