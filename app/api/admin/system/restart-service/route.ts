import {
  resolveApplicationRestartScripts,
  scheduleApplicationRestart,
} from '@/src/platform/maintenance/service-restart'
import { ok } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RestartServiceBody = {
  confirmation?: string
}

export const POST = defineMutationRoute<RestartServiceBody>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    if (
      String(body?.confirmation ?? '')
        .trim()
        .toUpperCase() !== 'RESTART'
    ) {
      return new Response(
        JSON.stringify({ error: { message: 'Type RESTART to confirm' } }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const scripts = await resolveApplicationRestartScripts()

    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'APPLICATION_SERVICE_RESTART_REQUESTED',
      entityType: 'system',
      metadata: {
        source: 'admin_system_control',
        stopScript: scripts.stopScript,
        startScript: scripts.startScript,
      },
    }).catch(() => {})

    scheduleApplicationRestart(scripts, 500)

    return ok({
      accepted: true,
      message: 'VPOS FTC service restart scheduled',
    })
  },
})
