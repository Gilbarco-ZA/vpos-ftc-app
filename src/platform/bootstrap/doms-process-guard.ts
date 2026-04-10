import { OSServices, SERVICE_COMMANDS } from '@gilbarcoafs/vpos-common'

export type DomsProcessGuard = {
  command?: string
  instanceName: string
  acquireOrHandleCommand: () => void
  release: () => void
}

const normalizeInstanceName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')

export function createDomsProcessGuard(appName: string): DomsProcessGuard {
  const osServices = new OSServices()
  const instanceName = normalizeInstanceName(appName)

  const tryLock = () => {
    const result = osServices.lockInstance(instanceName, true)
    if (!result?.success) {
      throw new Error(`Failed to acquire process lock for ${instanceName}`)
    }
  }

  const acquireOrHandleCommand = () => {
    const cmd = osServices.command

    if (!cmd) {
      osServices.stopInstances(instanceName)
      tryLock()
      return
    }

    switch (cmd) {
      case SERVICE_COMMANDS.START:
        osServices.stopInstances(instanceName)
        tryLock()
        return

      case SERVICE_COMMANDS.STOP:
        osServices.stopInstances(instanceName)
        process.exit(0)

      case SERVICE_COMMANDS.RESTART:
        osServices.stopInstances(instanceName)
        tryLock()
        return

      default:
        osServices.stopInstances(instanceName)
        tryLock()
    }
  }

  const release = () => {
    try {
      osServices.unlockInstance()
    } catch {}
  }

  return {
    command: osServices.command,
    instanceName,
    acquireOrHandleCommand,
    release,
  }
}
