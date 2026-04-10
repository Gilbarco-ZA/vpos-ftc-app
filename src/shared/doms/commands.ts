import { domsCommands as controlDomsCommands } from '@/src/shared/control/commands'

export function getDomsCommands() {
  return { ...controlDomsCommands }
}

export const domsCommands = getDomsCommands()
