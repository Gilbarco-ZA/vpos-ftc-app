import { notFound } from '@/src/platform/web/api/response'
import { domsCommands } from '@/src/shared/doms/commands'

export function normalizeDomsCommand(command: string) {
  const cmdName = String(command || '')
    .trim()
    .toLowerCase()
  const cmd = domsCommands[cmdName]
  if (!cmd) {
    return {
      ok: false as const,
      response: notFound(`Unknown doms command: ${cmdName}`),
    }
  }

  return {
    ok: true as const,
    cmdName,
    cmd,
  }
}
