import { query, queryOne } from '@/src/platform/db/postgres'
import { CommandHandler } from '@/src/shared/control/types'
import { getRuntimeManager } from '@/src/shared/runtime/manager'
import { uuidv4 } from '@/src/shared/utils/uuid'

async function createControlEvent(opts: {
  stationId: string
  action: string
  targetProcess?: string | null
  requestedBy?: string | null
}) {
  const { stationId, action, targetProcess = null, requestedBy = null } = opts
  const row = await queryOne<{ id: string }>(
    `INSERT INTO process_control_events (id, station_id, action, target_process, status, requested_by)
	     VALUES ($1,$2,$3,$4,'PENDING',$5)
	     RETURNING id`,
    [uuidv4(), stationId, action, targetProcess, requestedBy],
  )
  if (!row?.id) throw new Error('Failed to create process_control_events row')
  return row.id
}

async function completeControlEvent(
  id: string,
  ok: boolean,
  errorMessage?: string | null,
) {
  await query(
    `UPDATE process_control_events
	     SET status = $2,
	         completed_at = NOW(),
	         error_message = $3,
	         updated_at = NOW()
	   WHERE id = $1`,
    [id, ok ? 'COMPLETED' : 'FAILED', errorMessage ?? null],
  )
}

const restart: CommandHandler = async (ctx) => {
  const reason = String((ctx.args as any)?.reason ?? 'manual')
  const eventId = await createControlEvent({
    stationId: ctx.stationId,
    action: 'RESTART_SUPERVISOR',
    targetProcess: null,
    requestedBy: ctx.userId ?? null,
  })
  try {
    const res = await getRuntimeManager(ctx.stationId).restart(reason)
    await completeControlEvent(eventId, true, null)
    return { ok: true, eventId, result: res }
  } catch (e: any) {
    await completeControlEvent(eventId, false, e?.message ?? String(e))
    return { ok: false, eventId, error: e?.message ?? String(e) }
  }
}

const reloadConfig: CommandHandler = async (ctx) => {
  const eventId = await createControlEvent({
    stationId: ctx.stationId,
    action: 'RELOAD_CONFIG',
    targetProcess: null,
    requestedBy: ctx.userId ?? null,
  })
  try {
    const res = await getRuntimeManager(ctx.stationId).reloadConfig()
    await completeControlEvent(eventId, true, null)
    return { ok: true, eventId, result: res }
  } catch (e: any) {
    await completeControlEvent(eventId, false, e?.message ?? String(e))
    return { ok: false, eventId, error: e?.message ?? String(e) }
  }
}

export const controlCommands: Record<string, CommandHandler> = {
  // canonical
  restart,
  'reload-config': reloadConfig,

  // legacy aliases (vpos-console / vpos-app)
  'restart-supervisor': restart,
  restartSupervisor: restart,
  restart_supervisor: restart,

  reloadConfig,
  reload_config: reloadConfig,
  reloadconfig: reloadConfig,
}

export const controlCommandAliases: Record<string, string> = {
  // canonical
  restart: 'restart',
  'reload-config': 'reload-config',

  // legacy aliases → canonical
  'restart-supervisor': 'restart',
  restartSupervisor: 'restart',
  restart_supervisor: 'restart',

  reloadConfig: 'reload-config',
  reload_config: 'reload-config',
  reloadconfig: 'reload-config',
}

export function describeControlCommands() {
  const byCanonical: Record<string, { canonical: string; aliases: string[] }> =
    {}
  for (const [alias, canonical] of Object.entries(controlCommandAliases)) {
    if (!byCanonical[canonical])
      byCanonical[canonical] = { canonical, aliases: [] }
    if (alias !== canonical) byCanonical[canonical].aliases.push(alias)
  }
  return Object.values(byCanonical).map((c) => ({
    name: c.canonical,
    aliases: c.aliases.sort(),
    http: {
      method: 'POST',
      path: '/api/control/vpos/{command}',
      legacyPath: '/api/control/control/{command}',
    },
    auth: ['administrator'] as const,
  }))
}
