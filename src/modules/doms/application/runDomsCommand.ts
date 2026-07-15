import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { forbidden } from '@/src/platform/web/api/response'
import { ensureDomsBackendAllowed } from '@/src/shared/doms/backend'

import { authorizeDomsCommand } from './domsCommandAuthorization'
import { normalizeDomsCommand } from './normalizeDomsCommand'

export async function runDomsCommand(
  user: SessionUser,
  params: { command: string },
  payload: any,
) {
  await ensureDomsBackendAllowed(user.stationId)

  const normalized = normalizeDomsCommand(params.command)
  if (!normalized.ok) {
    return normalized.response
  }

  const authorization = authorizeDomsCommand({
    role: user.role,
    commandName: normalized.cmdName,
    payload,
  })
  if (!authorization.allowed) {
    return forbidden(
      authorization.reason ?? 'DOMS command is not permitted',
      undefined,
      {
        code: 'DOMS_COMMAND_FORBIDDEN',
        commandType: authorization.commandType,
        requiredRoles: authorization.requiredRoles,
      },
    )
  }

  const data = await normalized.cmd(
    { stationId: user.stationId, userId: user.id, roles: [user.role] },
    payload,
  )

  return NextResponse.json({ success: !!data?.ok, data })
}
