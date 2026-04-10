import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { runTerminalCommand } from '@/src/modules/terminal/application/runTerminalCommand'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<
  Record<string, never>,
  { command: string }
>({
  roles: ['administrator'],
  csrf: false,
  getParams: (ctx) => ctx?.params ?? { command: '' },
  handler: async (_req, { params }) => {
    return await runTerminalCommand(params.command)
  },
})
