import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getDomsCommandResult } from '@/src/modules/doms/application/getDomsCommandResult'
import { runDomsCommand } from '@/src/modules/doms/application/runDomsCommand'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const roles = ['administrator', 'manager'] as const

export const GET = defineGetRoute({
  roles: [...roles],
  getParams: ({ params }: { params: { command: string } }) => params,
  handler: async (_req, { user, params }) => {
    return await getDomsCommandResult(user, params)
  },
})

export const POST = defineMutationRoute({
  roles: [...roles],
  csrf: false,
  getParams: ({ params }: { params: { command: string } }) => params,
  handler: async (_req, { user, body, params }) => {
    return await runDomsCommand(user, params, body)
  },
})
