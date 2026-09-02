import {
  controlCommands,
  describeControlCommands,
  describeDomsCommands,
  domsCommands,
} from '@/src/modules/control/application/control/commands'

export const controlCommandRegistry: Record<string, Record<string, any>> = {
  vpos: controlCommands,
  control: controlCommands,
  doms: domsCommands,
}

export function getControlRegistryPayload() {
  const vposCommands = describeControlCommands()
  const domsCommandsDescription = describeDomsCommands()
  return {
    vpos: {
      module: 'vpos',
      endpoint: '/api/control/vpos/{command}',
      legacyEndpoint: '/api/control/control/{command}',
      commands: vposCommands,
    },
    doms: {
      module: 'doms',
      endpoint: '/api/control/doms/{command}',
      altEndpoint: '/api/doms/{command}',
      commands: domsCommandsDescription,
    },
  }
}
