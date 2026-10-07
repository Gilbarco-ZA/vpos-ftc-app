import { badRequestError } from '@/src/platform/web/api/api-error'
import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'
import { createAuditLog } from '@/src/shared/audit/log'
import {
  getPresenceUrlFilePath,
  readPresenceUrl,
  validatePresenceUrl,
  writePresenceUrl,
} from '@/src/platform/runtime/presence-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PresenceConfigInput = {
  presenceUrl?: string | null
}

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async () => {
    return ok({
      presenceUrl: await readPresenceUrl(),
      filePath: getPresenceUrlFilePath(),
    })
  },
})

export const POST = defineMutationRoute<PresenceConfigInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    let presenceUrl: string
    try {
      presenceUrl = validatePresenceUrl(body?.presenceUrl)
    } catch (error) {
      throw badRequestError(
        error instanceof Error ? error.message : 'Invalid presence URL.',
      )
    }

    await writePresenceUrl(presenceUrl)

    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'CONFIG_UPDATED',
      entityType: 'runtime_config',
      metadata: {
        presenceUrl,
        filePath: getPresenceUrlFilePath(),
      },
    }).catch(() => {})

    return ok({
      presenceUrl,
      filePath: getPresenceUrlFilePath(),
    })
  },
})
