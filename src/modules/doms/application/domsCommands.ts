import { domsCommands as controlDomsCommands } from '@/src/modules/control/application/control/commands'

export function getDomsCommands() {
  return { ...controlDomsCommands }
}

export const domsCommands = getDomsCommands()
