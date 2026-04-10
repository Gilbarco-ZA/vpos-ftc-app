import { forbidden } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { executeControlCommand } from '@/src/modules/control/application/executeControlCommand'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<
  any,
  { module: string; command: string }
>({
  roles: ['administrator', 'manager'],
  csrf: false,
  getParams: (ctx) => ctx?.params ?? { module: '', command: '' },
  handler: async (_req, { user, body, params }) => {
    const mod = String(params.module || '').toLowerCase()
    if (mod !== 'doms' && user.role !== 'administrator') {
      return forbidden('Forbidden')
    }
    return await executeControlCommand(user, params, body)
  },
})
