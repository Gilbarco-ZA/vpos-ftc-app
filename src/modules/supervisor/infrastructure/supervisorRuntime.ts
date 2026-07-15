import os from 'os'

import { query } from '@/src/platform/db/postgres'
import { getRuntimeUptimeSeconds } from '@/src/platform/runtime/nodeProcess'
import { getSystemConfiguration } from '@/src/shared/config/loader'
import { getFiscalInboxMetrics } from '@/src/shared/runtime/fiscalInbox'
import {
  getAllProcessHeartbeats,
  upsertProcessHeartbeat,
} from '@/src/shared/runtime/heartbeats'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import { getFiscalRecoveryMeta } from '@/src/modules/runtime/infrastructure/fiscalRecoveryPolicy'
import {
  getRuntimeState,
  setRuntimeState,
} from '@/src/modules/runtime/infrastructure/runtimeState'

import type {
  ProcessOverride,
  SupervisorCommandType,
  SupervisorProcessStatus,
  SupervisorRuntimeDeps,
  SupervisorStatus,
} from './supervisorTypes'
import { InvalidActionError, ProcessNotFoundError } from './errors'
import {
  buildProcessAliasIndex,
  canonicalizeProcessName,
  ensureCoreProcessNames,
} from './processAliases'
import { PROCESS_OVERRIDES_KEY, SUPERVISOR_META_KEY } from './supervisorTypes'

export type {
  SupervisorCommandType,
  SupervisorCommand,
  SupervisorProcessStatus,
  SupervisorStatus,
} from './supervisorTypes'

type ResolvedSupervisorRuntimeDeps = Omit<
  Required<SupervisorRuntimeDeps>,
  'withLock'
> &
  Pick<SupervisorRuntimeDeps, 'withLock'>

export class SupervisorRuntime {
  private deps: ResolvedSupervisorRuntimeDeps

  constructor(
    private stationId: string,
    deps: SupervisorRuntimeDeps = {},
  ) {
    this.deps = {
      query: deps.query ?? query,
      kvGet: deps.kvGet ?? kvGet,
      kvSet: deps.kvSet ?? kvSet,
      getSystemConfiguration:
        deps.getSystemConfiguration ?? getSystemConfiguration,
      getRuntimeState: deps.getRuntimeState ?? getRuntimeState,
      setRuntimeState: deps.setRuntimeState ?? setRuntimeState,
      withLock: deps.withLock,
    }
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const externalWithLock = this.deps.withLock
    if (externalWithLock) return await externalWithLock(key, fn)

    await this.deps.query(`SELECT pg_advisory_lock(hashtext($1))`, [key])
    try {
      return await fn()
    } finally {
      await this.deps.query(`SELECT pg_advisory_unlock(hashtext($1))`, [key])
    }
  }

  private async getProcessOverrides() {
    return (
      (await this.deps.kvGet<Record<string, ProcessOverride>>(
        this.stationId,
        PROCESS_OVERRIDES_KEY,
      )) ?? {}
    )
  }

  private async setProcessOverrides(next: Record<string, ProcessOverride>) {
    await this.deps.kvSet(this.stationId, PROCESS_OVERRIDES_KEY, next)
  }

  private async updateProcessOverride(name: string, patch: ProcessOverride) {
    const current = await this.getProcessOverrides()
    const next = {
      ...current,
      [name]: {
        ...current[name],
        ...patch,
        lastHealthCheck: Date.now(),
      },
    }
    await this.setProcessOverrides(next)
    return next[name]
  }

  private async getProcessNames(): Promise<string[]> {
    try {
      const cfg = await this.deps.getSystemConfiguration(this.stationId)
      const processConfig = cfg?.processes?.process ?? {}
      const names = Object.keys(processConfig)
      if (names.length) return names
    } catch {
      // ignore and fallback to default
    }
    return ['api']
  }

  async getStatus(): Promise<SupervisorStatus> {
    const now = Date.now()

    safeAsync(
      upsertProcessHeartbeat({
        stationId: this.stationId,
        processName: 'api',
        pid: process.pid,
        status: 'running',
        connected: true,
        metrics: {
          uptime: getRuntimeUptimeSeconds(),
          loadAvg: os.loadavg(),
        },
      }),
      'supervisor.apiHeartbeat',
    )
    const overrides = await this.getProcessOverrides()
    const runtimeState = await this.deps.getRuntimeState(this.stationId)
    const lastError = await this.deps.kvGet<any>(
      this.stationId,
      'vpos.runtime.lastError',
    )

    let processConfig: Record<string, any> = {}
    try {
      const cfg = await this.deps.getSystemConfiguration(this.stationId)
      processConfig = cfg?.processes?.process ?? {}
    } catch {
      processConfig = {}
    }

    const names =
      Object.keys(processConfig).length > 0
        ? Object.keys(processConfig)
        : ['api']

    ensureCoreProcessNames(names)

    // Pull heartbeats (real status) if schema is present.
    let heartbeats: Record<string, any> = {}
    try {
      const hb = await getAllProcessHeartbeats(this.stationId)
      for (const r of hb ?? []) {
        heartbeats[String((r as any).processName)] = r
      }
    } catch {
      heartbeats = {}
    }

    const staleAfterMs = Number(process.env.VPOS_HEARTBEAT_STALE_MS || 15_000)

    const processes: Record<string, SupervisorProcessStatus> = {}
    for (const name of names) {
      const cfg = processConfig[name] ?? {}
      const enabled = cfg.enabled !== false
      const override = overrides[name] ?? {}
      const hb = heartbeats[name]

      const hbStatus = hb?.status ? String(hb.status).toLowerCase() : null
      const derivedStatus =
        hbStatus ??
        override.status ??
        (enabled
          ? runtimeState.status === 'RESTARTING'
            ? 'restarting'
            : 'running'
          : 'disabled')

      const lastHbAt = (hb as any)?.lastHeartbeatAt
        ? new Date((hb as any).lastHeartbeatAt).getTime()
        : (hb as any)?.last_heartbeat_at
          ? new Date((hb as any).last_heartbeat_at).getTime()
          : null
      const isStale = lastHbAt != null ? now - lastHbAt > staleAfterMs : false
      const connectedFromHeartbeat = (hb as any)?.connected ?? false

      processes[name] = {
        status: isStale ? 'stale' : derivedStatus,
        pid: (hb as any)?.pid ?? (name === 'api' ? process.pid : undefined),
        uptime: getRuntimeUptimeSeconds(),
        lastHealthCheck: override.lastHealthCheck ?? lastHbAt ?? now,
        connected:
          override.connected ??
          (!isStale && connectedFromHeartbeat) ??
          (enabled && derivedStatus !== 'stopped'),
        metrics: (hb as any)?.metrics ?? null,
        lastError:
          override.lastError ??
          (hb as any)?.lastError ??
          (hb as any)?.last_error ??
          (typeof lastError === 'string' ? lastError : undefined),
        restartCount:
          override.restartCount ??
          (hb as any)?.restartCount ??
          (hb as any)?.restart_count ??
          0,
      }
    }

    const cpu = process.cpuUsage()
    const cpuUsage = Math.round(((cpu.user + cpu.system) / 1e6) * 100) / 100
    const meta =
      (await this.deps.kvGet<any>(this.stationId, SUPERVISOR_META_KEY)) ?? {}
    const fiscalRecovery = await safeAsync(
      getFiscalRecoveryMeta(this.stationId),
      'supervisor.fiscalRecoveryMeta',
    )
    const fiscalInbox = await safeAsync(
      getFiscalInboxMetrics(this.stationId),
      'supervisor.fiscalInboxMetrics',
    )

    return {
      processes,
      uptime: getRuntimeUptimeSeconds(),
      timestamp: now,
      system: {
        uptime: getRuntimeUptimeSeconds(),
        loadAvg: os.loadavg(),
        freeMemory: os.freemem(),
        totalMemory: os.totalmem(),
        cpuUsage,
      },
      optional: {
        runtimeState,
        lastError,
        fiscalRecovery,
        fiscalInbox,
        ...meta,
        processAliases: buildProcessAliasIndex(),
      },
    }
  }

  async getProcessStatus(name: string) {
    const canonical = canonicalizeProcessName(name)
    const status = await this.getStatus()
    return status.processes[canonical]
  }

  private mapActionToCommand(action: string): SupervisorCommandType {
    switch (action.toLowerCase()) {
      case 'restart':
        return 'RESTART_PROCESS'
      case 'stop':
        return 'STOP_PROCESS'
      case 'start':
        return 'START_PROCESS'
      case 'status':
        return 'GET_STATUS'
      default:
        throw new InvalidActionError(action)
    }
  }

  private async getProcessConfig(name: string): Promise<any> {
    try {
      const cfg = await this.deps.getSystemConfiguration(this.stationId)
      return (cfg?.processes?.process ?? {})[name] ?? {}
    } catch {
      return {}
    }
  }

  private async getProcessPid(name: string): Promise<number | undefined> {
    try {
      const hb = await getAllProcessHeartbeats(this.stationId)
      const row = (hb ?? []).find(
        (r: any) => String(r.processName ?? r.process_name) === name,
      )
      const pid = (row as any)?.pid
      return typeof pid === 'number' ? pid : pid ? Number(pid) : undefined
    } catch {
      return undefined
    }
  }

  private getPolicyNumber(value: any, fallback: number): number {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }

  private async trySignalProcess(
    pid: number,
    signal: NodeJS.Signals,
  ): Promise<boolean> {
    try {
      process.kill(pid, signal)
      return true
    } catch {
      return false
    }
  }

  async commandProcess(name: string, action: string, options?: any) {
    const canonical = canonicalizeProcessName(name)
    await this.assertKnownProcess(canonical)

    const command = this.mapActionToCommand(action)
    if (command === 'GET_STATUS') {
      return await this.getProcessStatus(canonical)
    }

    const procCfg = await this.getProcessConfig(canonical)
    const allowedToStop = procCfg?.allowedToStop ?? true
    if (command === 'STOP_PROCESS' && allowedToStop === false) {
      throw new InvalidActionError(`stop not allowed for process: ${canonical}`)
    }

    const supervisorCfg = await this.deps
      .getSystemConfiguration(this.stationId)
      .then((c) => c?.supervisor)
      .catch(() => null as any)

    const restartDelay = this.getPolicyNumber(
      procCfg?.restartDelay,
      this.getPolicyNumber(supervisorCfg?.restartDelay, 5_000),
    )

    const pid = await this.getProcessPid(canonical)

    if (command === 'STOP_PROCESS') {
      await this.updateProcessOverride(canonical, {
        status: 'stopped',
        connected: false,
      })
      if (pid && canonical !== 'api') {
        await this.trySignalProcess(pid, 'SIGTERM')
      }
      return { message: `Process ${canonical} stopped`, pid, options }
    }

    if (command === 'START_PROCESS') {
      await this.updateProcessOverride(canonical, {
        status: 'running',
        connected: true,
        lastError: undefined,
      })
      return { message: `Process ${canonical} started`, pid, options }
    }

    // RESTART_PROCESS
    const currentOverrides = await this.getProcessOverrides()
    await this.updateProcessOverride(canonical, {
      status: 'restarting',
      connected: true,
      restartCount: (currentOverrides[canonical]?.restartCount ?? 0) + 1,
    })

    if (pid && canonical !== 'api') {
      await this.trySignalProcess(pid, 'SIGTERM')
    }

    // Give external supervisor a chance to restart the process.
    await new Promise((r) => setTimeout(r, restartDelay))

    await this.updateProcessOverride(canonical, {
      status: 'running',
      connected: true,
    })

    return {
      message: `Process ${canonical} restarted`,
      pid,
      restartDelay,
      options,
    }
  }

  async restartAll() {
    const cfg = await this.deps
      .getSystemConfiguration(this.stationId)
      .catch(() => null as any)
    const processConfig: Record<string, any> = cfg?.processes?.process ?? {}

    const names = await this.getProcessNames()
    for (const name of names) {
      const enabled = (processConfig?.[name]?.enabled ?? true) !== false
      if (!enabled) continue
      await this.commandProcess(name, 'restart')
    }
    return { message: 'Restart command sent for all enabled processes' }
  }

  async restartSupervisor(reason = 'manual') {
    return await this.withLock(
      `supervisor_restart:${this.stationId}`,
      async () => {
        await this.deps.setRuntimeState(this.stationId, {
          status: 'RESTARTING',
          message: `Restart requested (${reason})`,
        })
        await this.restartAll()
        await this.deps.setRuntimeState(this.stationId, {
          status: 'IDLE',
          message: 'Restart complete',
        })
        await this.deps.kvSet(this.stationId, SUPERVISOR_META_KEY, {
          lastRestartAt: new Date().toISOString(),
          lastRestartReason: reason,
        })
        return { ok: true }
      },
    )
  }

  async reloadConfig() {
    return await this.withLock(
      `supervisor_reload:${this.stationId}`,
      async () => {
        const startedAt = Date.now()
        await this.deps.setRuntimeState(this.stationId, {
          message: 'Config reload requested',
        })

        let checksum: string | null = null
        let error: string | null = null

        try {
          const cfg = await this.deps.getSystemConfiguration(this.stationId)
          const raw = JSON.stringify(cfg ?? {})
          // Simple checksum (sha256) for operator visibility.
          const crypto = await import('crypto')
          checksum = crypto.createHash('sha256').update(raw).digest('hex')
        } catch (e: any) {
          error = e?.message ?? String(e)
        }

        await this.deps.kvSet(this.stationId, SUPERVISOR_META_KEY, {
          lastReloadAt: new Date().toISOString(),
          lastReloadChecksum: checksum,
          lastReloadError: error,
          lastReloadMs: Date.now() - startedAt,
        })

        if (error) {
          await this.deps.setRuntimeState(this.stationId, {
            status: 'ERROR',
            message: `Config reload failed: ${error}`,
          })
          return { ok: false, error, checksum }
        }

        await this.deps.setRuntimeState(this.stationId, {
          status: 'IDLE',
          message: 'Config reload complete',
        })

        return { ok: true, checksum }
      },
    )
  }

  private async assertKnownProcess(name: string) {
    const names = await this.getProcessNames()

    // Also allow core worker names that are always exposed by getStatus()
    ensureCoreProcessNames(names)

    if (!names.includes(name)) {
      throw new ProcessNotFoundError(name)
    }
  }
}
