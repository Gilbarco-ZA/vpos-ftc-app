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

  const isManagedByStartScript = () =>
    process.env.VPOS_MANAGED_BY_START_SH === '1'

  const acquireOrHandleCommand = () => {
    const cmd = osServices.command

    if (isManagedByStartScript()) {
      // start.sh is the process supervisor in DOMS/package-managed mode.
      // Do not acquire the app-level OSServices lock here: stale app lock files
      // can survive a forced health-timeout kill and prevent the next start.
      // start.sh already handles duplicate detection via its own PID file.
      return
    }

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
      if (isManagedByStartScript()) {
        return
      }
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
