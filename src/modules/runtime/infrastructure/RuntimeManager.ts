import { safeAsync } from '@/src/shared/utils/safeAsync'

import { PosControlRuntime } from '@/src/modules/pos/infrastructure/posControlRuntime'
import { SupervisorRuntime } from '@/src/modules/supervisor/infrastructure/supervisorRuntime'

import { startInProcessRuntime } from './inProcessRuntime'

export class RuntimeManager {
  private inProcess: { stop: () => void } | null = null
  private started = false

  readonly supervisor: SupervisorRuntime
  readonly posControl: PosControlRuntime

  constructor(public readonly stationId: string) {
    this.supervisor = new SupervisorRuntime(stationId)
    this.posControl = new PosControlRuntime(stationId)
  }

  async status() {
    return await this.supervisor.getStatus()
  }

  async restart(reason: string = 'manual') {
    // Restart in-process workers as well as recording supervisor restart metadata.
    await safeAsync(this.stop(), 'RuntimeManager.restart.stop')
    await safeAsync(this.start(), 'RuntimeManager.restart.start')
    return await this.supervisor.restartSupervisor(reason)
  }

  async reloadConfig() {
    // Apply DB-first configuration updates by restarting in-process workers.
    // If start/stop are no-ops (e.g., in very early builds), this degrades
    // gracefully to a supervisor metadata update.
    await safeAsync(this.stop(), 'RuntimeManager.reloadConfig.stop')
    await safeAsync(this.start(), 'RuntimeManager.reloadConfig.start')
    return await this.supervisor.reloadConfig()
  }

  async start() {
    if (this.started) return { ok: true, started: false }
    this.started = true

    // Start the in-process runtime which hosts the legacy "supervisor" style
    // workers (queue processors, print jobs, proxy sender, etc.).
    this.inProcess = startInProcessRuntime(this.stationId)
    return { ok: true, started: true }
  }

  async stop() {
    if (!this.started) return { ok: true, stopped: false }
    this.started = false

    try {
      this.inProcess?.stop()
    } finally {
      this.inProcess = null
    }

    return { ok: true, stopped: true }
  }
}

const managers = new Map<string, RuntimeManager>()

export const getRuntimeManager = (stationId: string) => {
  let manager = managers.get(stationId)
  if (!manager) {
    manager = new RuntimeManager(stationId)
    managers.set(stationId, manager)
    // Best-effort auto-start in-process runtime on first use.
    safeAsync(manager.start(), 'RuntimeManager.autoStart')
  }
  return manager
}
